export const MOMENT_MODE_DETAILS = Object.freeze({
    reality: {
        label: '现实分享',
        icon: 'fa-earth-asia',
        description: '角色会把它理解为你从现实生活分享的一扇窗口，不会把它硬塞进剧情时间线。',
    },
    story: {
        label: '剧情内动态',
        icon: 'fa-book-open',
        description: '它会被视为所选角色剧情线里真实发生的事情；谁能看见仍由可见范围单独决定。',
    },
    aside: {
        label: '轻松调侃',
        icon: 'fa-face-laugh-squint',
        description: '用于玩梗、打破第四面墙或调侃角色，不进入现实了解或剧情记忆。',
    },
    character: {
        label: '角色动态',
        icon: 'fa-user-pen',
        description: '由 AI 角色依据角色卡与其可用记忆主动发布；用户只能删除，不能代替角色改写。',
    },
});

export const LESLIE_MOMENTS_SETTINGS_KEY = 'leslieMoments';
export const LESLIE_MOMENTS_SETTINGS_SCHEMA_VERSION = 1;
export const MOMENT_ENTHUSIASM_LEVELS = Object.freeze(['low', 'medium', 'high']);
export const MOMENT_ENTHUSIASM_PROFILES = Object.freeze({
    low: Object.freeze({
        label: '低',
        publicInteractionChance: 0.3,
        actorLimit: 1,
        scheduleLabel: '约 5–15 分钟后首次查看',
        description: '30% 公开互动机会 · 每条最多 1 位角色',
        prompt: '保持克制。只有非常符合角色性格和关系时才公开点赞或评论，多数情况下安静读完。',
    }),
    medium: Object.freeze({
        label: '中',
        publicInteractionChance: 0.7,
        actorLimit: 3,
        scheduleLabel: '约 1–3 分钟后首次查看',
        description: '70% 公开互动机会 · 每条最多 3 位角色',
        prompt: '自然参与。内容与角色相关时优先点赞或留下简短评论，不相关时可以安静读完。',
    }),
    high: Object.freeze({
        label: '高',
        publicInteractionChance: 0.95,
        actorLimit: 5,
        scheduleLabel: '约 20–90 秒后首次查看',
        description: '95% 公开互动机会 · 每条最多 5 位角色',
        prompt: '表现得热情主动。只要不违背角色人格，应优先公开互动，并在有具体话可说时优先留下简短评论。',
    }),
});

export const DEFAULT_LESLIE_MOMENTS_SETTINGS = Object.freeze({
    schemaVersion: LESLIE_MOMENTS_SETTINGS_SCHEMA_VERSION,
    enthusiasm: 'medium',
});

export function normalizeLeslieMomentsSettings(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
        schemaVersion: LESLIE_MOMENTS_SETTINGS_SCHEMA_VERSION,
        enthusiasm: MOMENT_ENTHUSIASM_LEVELS.includes(source.enthusiasm)
            ? source.enthusiasm
            : DEFAULT_LESLIE_MOMENTS_SETTINGS.enthusiasm,
    };
}

export function getMomentEnthusiasmProfile(level) {
    return MOMENT_ENTHUSIASM_PROFILES[level] ?? MOMENT_ENTHUSIASM_PROFILES.medium;
}

export function getMomentModeDetails(mode) {
    return MOMENT_MODE_DETAILS[mode] ?? MOMENT_MODE_DETAILS.reality;
}

export function describeMomentVisibility(visibility) {
    if (visibility?.type !== 'selected') {
        return '所有角色可见';
    }
    const targets = Array.isArray(visibility.targets) ? visibility.targets : [];
    if (!targets.length) {
        return '尚未选择角色';
    }
    if (targets.length <= 2) {
        return `仅 ${targets.map(target => target.label).join('、')} 可见`;
    }
    return `仅 ${targets.slice(0, 2).map(target => target.label).join('、')} 等 ${targets.length} 个角色可见`;
}

export function sortSelectedFirst(items, isSelected, getLabel = item => item?.label ?? '') {
    return (Array.isArray(items) ? items : [])
        .map((item, index) => ({ item, index, selected: Boolean(isSelected(item)) }))
        .sort((left, right) => Number(right.selected) - Number(left.selected)
            || String(getLabel(left.item)).localeCompare(String(getLabel(right.item)), 'zh-CN')
            || left.index - right.index)
        .map(entry => entry.item);
}

export function sortMomentMemoryEvents(items, { mode = 'level', selectedIds = [] } = {}) {
    const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
    const levelOrder = { A: 0, B: 1, C: 2 };
    const timestamp = item => {
        const value = new Date(item?.createdAt ?? item?.updatedAt ?? 0).getTime();
        return Number.isFinite(value) ? value : 0;
    };
    return (Array.isArray(items) ? items : [])
        .map((item, index) => ({ item, index, isSelected: selected.has(item?.id) }))
        .sort((left, right) => {
            const selectedDifference = Number(right.isSelected) - Number(left.isSelected);
            if (selectedDifference) {
                return selectedDifference;
            }
            if (mode === 'recent') {
                const timeDifference = timestamp(right.item) - timestamp(left.item);
                if (timeDifference) {
                    return timeDifference;
                }
            } else {
                const levelDifference = (levelOrder[String(left.item?.level).toUpperCase()] ?? 3)
                    - (levelOrder[String(right.item?.level).toUpperCase()] ?? 3);
                if (levelDifference) {
                    return levelDifference;
                }
                const timeDifference = timestamp(right.item) - timestamp(left.item);
                if (timeDifference) {
                    return timeDifference;
                }
            }
            return String(left.item?.summary ?? '').localeCompare(String(right.item?.summary ?? ''), 'zh-CN')
                || left.index - right.index;
        })
        .map(entry => entry.item);
}

export function filterMomentPosts(posts, { mode = 'all', includeArchived = false } = {}) {
    return (Array.isArray(posts) ? posts : [])
        .filter(post => includeArchived || post.status === 'active')
        .filter(post => mode === 'all'
            || post.mode === mode
            || (mode === 'reality' && post.mode === 'character' && post.worldLine !== 'story'))
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

export function formatMomentTime(value, now = new Date()) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
        return '时间未知';
    }
    const difference = Math.max(0, now.getTime() - date.getTime());
    if (difference < 60_000) {
        return '刚刚';
    }
    if (difference < 60 * 60_000) {
        return `${Math.floor(difference / 60_000)} 分钟前`;
    }
    if (difference < 24 * 60 * 60_000) {
        return `${Math.floor(difference / (60 * 60_000))} 小时前`;
    }
    if (difference < 7 * 24 * 60 * 60_000) {
        return `${Math.floor(difference / (24 * 60 * 60_000))} 天前`;
    }
    return date.toLocaleDateString('zh-CN', { year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric', month: 'short', day: 'numeric' });
}
