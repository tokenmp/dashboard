<?php
declare(strict_types=1);

/**
 * 从 Git annotated tag 同步版本日志到 version_releases 表。
 *
 * 用法：
 *   php scripts/sync-releases.php           # 同步所有 v* tag（upsert，不删除）
 *   php scripts/sync-releases.php --prune   # 同步并删除 DB 中不存在对应 tag 的记录
 *
 * Tag message 约定（annotated tag，-a -m）：
 *   第一行：vX.Y.Z: 标题            ← 标题去掉 "vX.Y.Z:" 前缀
 *   空行
 *   正文…                           ← 作为 body
 *
 * release_type 默认 feature；若标题或正文含 [fix]/[perf]/[improvement] 则自动推断。
 * summary 取 body 第一个非空行；无 body 时回退为标题。
 *
 * 也可在 tag message 末尾加元数据行（可选）：
 *   <!-- type: fix -->              ← 指定 release_type
 *
 * 数据源：git for-each-ref（需在仓库根目录运行，或设置 GIT_DIR）。
 */

require __DIR__ . '/../vendor/autoload.php';

$app = new \think\App();
$app->initialize();

use think\facade\Db;

$prune = in_array('--prune', $argv, true);

// 仓库根目录（脚本在 scripts/ 下，上一级即根）
$repoRoot = dirname(__DIR__);

// 1. 取所有 v* 开头的 annotated tag（仅单行字段，避免 exec 截断多行 body）
//    body 含换行，单独用 shell_exec 读取
$format = '%(refname:short)%09%(taggerdate:iso8601)%09%(contents:subject)';
$cmd = 'git -C ' . escapeshellarg($repoRoot) . ' for-each-ref --format=' . escapeshellarg($format) . ' refs/tags/v*';
exec($cmd, $output, $rc);
if ($rc !== 0) {
    fwrite(STDERR, "git for-each-ref 失败（exit $rc）。请在仓库内运行。\n");
    exit(1);
}

// 2. 解析 tag
$tags = [];
foreach ($output as $line) {
    $parts = explode("\t", $line, 3);
    if (count($parts) < 2) {
        continue; // 轻量 tag 无 taggerdate，跳过
    }
    [$version, $date, $subject] = array_pad($parts, 3, '');
    // body 单独读取（shell_exec 保留换行，%(contents:body) 可能多行）
    $body = (string) shell_exec('git -C ' . escapeshellarg($repoRoot) . ' tag -l --format=' . escapeshellarg('%(contents:body)') . ' ' . escapeshellarg($version));
    $tags[] = compact('version', 'date', 'subject', 'body');
}

if (empty($tags)) {
    echo "没有 v* annotated tag，无需同步。\n";
    exit(0);
}

// 3. upsert
$upserted = 0;
$dbTags = [];
foreach ($tags as $t) {
    $version = $t['version'];
    $dbTags[] = $version;

    // 标题：去掉 "vX.Y.Z:" 前缀
    $title = preg_replace('/^v\d+\.\d+\.\d+\s*:\s*/', '', $t['subject']);
    $title = trim($title);
    if ($title === '') {
        $title = $version;
    }

    // body 清理（去掉末尾签名段如 -----BEGIN PGP SIGNATURE-----）
    $body = trim($t['body']);
    $body = preg_replace('/-----BEGIN PGP SIGNATURE-----.*$/s', '', $body);
    $body = trim($body);

    // release_type 推断：优先 <!-- type: xxx --> 元数据，否则按关键词
    $type = 'feature';
    if (preg_match('/<!--\s*type:\s*(\w+)\s*-->/', $body, $m)) {
        $type = $m[1];
    } elseif (preg_match('/\[(fix|perf|improvement|feature)\]/i', $title . ' ' . $body, $m)) {
        $type = strtolower($m[1]);
    }

    // summary：body 第一个非空行，无则标题
    $summary = null;
    if ($body !== '') {
        foreach (preg_split('/\r?\n/', $body) as $ln) {
            $ln = trim($ln);
            if ($ln !== '' && !str_starts_with($ln, '<!--') && !str_starts_with($ln, '──') && !str_starts_with($ln, '━━━')) {
                $summary = $ln;
                break;
            }
        }
    }
    if ($summary === null) {
        $summary = $title;
    }

    // sort_order：语义版本 major*10000 + minor*100 + patch
    $sortOrder = 0;
    if (preg_match('/^v?(\d+)\.(\d+)\.(\d+)/', $version, $m)) {
        $sortOrder = (int) $m[1] * 10000 + (int) $m[2] * 100 + (int) $m[3];
    }

    $row = [
        'version'      => $version,
        'title'        => $title,
        'summary'      => $summary,
        'body'         => $body !== '' ? $body : $summary,
        'release_type' => $type,
        'released_at'  => $t['date'],
        'status'       => 'published',
        'sort_order'   => $sortOrder,
        'updated_at'   => date('Y-m-d H:i:s'),
    ];

    Db::connect('pgsql')->query(
        'INSERT INTO version_releases (id, version, title, summary, body, release_type, released_at, status, sort_order, created_at, updated_at)
         VALUES (gen_random_uuid(), :version, :title, :summary, :body, :release_type, :released_at::timestamptz, :status, :sort_order, :released_at::timestamptz, :updated_at::timestamptz)
         ON CONFLICT (version) DO UPDATE SET
           title = EXCLUDED.title,
           summary = EXCLUDED.summary,
           body = EXCLUDED.body,
           release_type = EXCLUDED.release_type,
           released_at = EXCLUDED.released_at,
           status = EXCLUDED.status,
           sort_order = EXCLUDED.sort_order,
           updated_at = EXCLUDED.updated_at',
        $row
    );
    $upserted++;
    echo "  ✓ $version  ($type, sort=$sortOrder)\n";
}

// 4. 可选清理
$deleted = 0;
if ($prune) {
    $dbVersions = Db::connect('pgsql')->query('SELECT version FROM version_releases');
    $dbSet = array_column($dbVersions, 'version');
    $tagSet = $dbTags;
    $orphans = array_diff($dbSet, $tagSet);
    foreach ($orphans as $v) {
        Db::connect('pgsql')->query('DELETE FROM version_releases WHERE version = ?', [$v]);
        $deleted++;
        echo "  ✗ $v  (pruned)\n";
    }
}

echo "\n同步完成：upsert $upserted 条" . ($prune ? "，删除 $deleted 条孤儿记录" : '') . "。\n";
