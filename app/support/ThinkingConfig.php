<?php
declare(strict_types=1);

namespace app\support;

use think\exception\HttpException;

/**
 * 思考深度配置（thinking_config JSONB）的构建/解析/继承解析。
 *
 * 结构: {"supported_efforts": [...], "default_effort": "..."}
 * 继承链（映射 → 模型 → 供应商，整体覆盖式继承）:
 *   1. 映射配置非空 → 以映射为准;
 *   2. 映射为空 → 继承模型;
 *   3. 模型为空 → 继承供应商;
 *   4. 全空 → executor 内置默认（low~max, 兜底 medium）。
 */
class ThinkingConfig
{
    /** 思考深度档位白名单，按实际强度规范排序：none（不启用）< low < minimal < medium < high < xhigh < max */
    public const EFFORT_LEVELS = ['none', 'low', 'minimal', 'medium', 'high', 'xhigh', 'max'];

    /**
     * 组装 thinking_config JSON 文本。
     * supported_efforts 与 default_effort 均缺省 → null（未配置，走继承/内置默认）。
     * default_effort 必须在 supported_efforts 内（有 supported 时），否则 400。
     */
    public static function build(?array $supported, string $defaultEffort): ?string
    {
        $efforts = [];
        if (is_array($supported)) {
            foreach ($supported as $e) {
                $v = strtolower(trim((string) $e));
                if ($v !== '' && in_array($v, self::EFFORT_LEVELS, true)) {
                    $efforts[$v] = true;
                }
            }
        }
        $efforts = array_keys($efforts);
        // 按规范强度排序，保证存储与展示顺序稳定
        $order = array_flip(self::EFFORT_LEVELS);
        usort($efforts, fn (string $a, string $b) => $order[$a] <=> $order[$b]);
        $default = strtolower(trim($defaultEffort));
        if ($default !== '' && !in_array($default, self::EFFORT_LEVELS, true)) {
            throw new HttpException(400, 'default_effort 取值非法（' . implode('/', self::EFFORT_LEVELS) . '）');
        }
        if ($default !== '' && !empty($efforts) && !in_array($default, $efforts, true)) {
            throw new HttpException(400, 'default_effort 必须在 supported_efforts 内');
        }
        if (empty($efforts) && $default === '') {
            return null;
        }
        return json_encode([
            'supported_efforts' => $efforts,
            'default_effort'    => $default !== '' ? $default : null,
        ], JSON_UNESCAPED_SLASHES);
    }

    /** 从请求 POST 中读取 supported_efforts / default_effort 并组装。 */
    public static function fromRequest($request): ?string
    {
        return self::build($request->post('supported_efforts'), trim((string) $request->post('default_effort', '')));
    }

    /**
     * 解析 thinking_config 为关联数组（null/空透传 null）。
     * 兼容两种来源：原生 Db::query 返回的 JSONB 字符串，
     * 以及 ThinkPHP 模型 toArray 自动反序列化出的数组。
     */
    public static function parse($raw): ?array
    {
        if (is_array($raw)) {
            $decoded = $raw;
        } elseif (is_string($raw) && $raw !== '' && $raw !== 'null') {
            $decoded = json_decode($raw, true);
        } else {
            return null;
        }
        if (!is_array($decoded) || $decoded === []) {
            return null;
        }
        // 仅接受结构合法的配置对象
        return isset($decoded['supported_efforts']) || isset($decoded['default_effort']) ? $decoded : null;
    }

    /**
     * 按继承链解析生效配置。
     * 返回 ['config' => array|null, 'source' => 'mapping'|'model'|'provider'|null]。
     */
    public static function resolve(?array $mapping, ?array $model, ?array $provider): array
    {
        foreach ([['mapping', $mapping], ['model', $model], ['provider', $provider]] as [$source, $cfg]) {
            if ($cfg !== null && ($cfg['supported_efforts'] ?? null) !== null) {
                return ['config' => $cfg, 'source' => $source];
            }
        }
        return ['config' => null, 'source' => null];
    }
}
