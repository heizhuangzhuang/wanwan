package run.wanwan.model;

/**
 * 资料卡相关枚举集中定义。
 */
public final class Enums {

    private Enums() {
    }

    /** 材料类型。 */
    public enum MaterialType {
        INSTITUTION, PAPER, FAMILY_STORY, ORIGINAL
    }

    /** 发布状态：只有 PUBLISHED 对外可见。 */
    public enum PublishState {
        DRAFT, PENDING_REVIEW, PUBLISHED, WITHDRAWN
    }

    /** 链接与原文状态，与发布状态分开。 */
    public enum LinkStatus {
        UNCHECKED, OK, NEEDS_RECHECK, SOURCE_RETRACTED
    }

    /** 访问条件。 */
    public enum AccessCondition {
        OPEN, LOGIN_REQUIRED, MAY_BE_PAID, UNKNOWN
    }

    /** 语言。 */
    public enum Language {
        ZH, OTHER
    }

    /**
     * 原文入口类型（ADR-004）。客户端只按该类型渲染入口，不得自行把 url 当作可打开网页。
     */
    public enum EntryType {
        WEB, MP_ARTICLE, MINIPROGRAM, CITATION_ONLY
    }
}
