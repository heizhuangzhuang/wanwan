package run.wanwan.model;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 五个固定阅读阶段（产品需求 v5 §2）。顺序即展示顺序。
 */
@Getter
@RequiredArgsConstructor
public enum Stage {
    JUST_FOUND("刚发现"),
    PRENATAL("产前了解与等待"),
    POSTNATAL_TREATMENT("出生后评估与治疗"),
    BRACE_DAILY("支具与日常生活"),
    LONG_TERM("长期随访与预后");

    private final String label;
}
