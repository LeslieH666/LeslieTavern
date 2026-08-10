export const MOMENT_MODE_DETAILS = Object.freeze({
    reality: {
        label: '现实分享',
        icon: 'fa-earth-asia',
        description: '角色会把它理解为你从现实生活分享的一扇窗口，不会把它硬塞进剧情时间线。',
    },
    story: {
        label: '剧情内动态',
        icon: 'fa-book-open',
        description: '它会被视为当前剧情线里真实发生的事情，因此只能发给这条剧情线里的角色。',
    },
    aside: {
        label: '轻松调侃',
        icon: 'fa-face-laugh-squint',
        description: '用于玩梗、打破第四面墙或调侃角色，不进入现实了解或剧情记忆。',
    },
});

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

export function filterMomentPosts(posts, { mode = 'all', includeArchived = false } = {}) {
    return (Array.isArray(posts) ? posts : [])
        .filter(post => includeArchived || post.status === 'active')
        .filter(post => mode === 'all' || post.mode === mode)
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
