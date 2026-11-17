package run.wanwan.model;

import run.wanwan.model.Enums.LinkStatus;
import run.wanwan.model.Enums.PublishState;

/**
 * 公开可见性规则的唯一实现。所有公开读取路径（列表、详情、专题、搜索、主题）都必须经过这里。
 */
public final class Visibility {

    private Visibility() {
    }

    /** 已发布且未删除：详情可访问。 */
    public static boolean isPublic(ResourceCard card) {
        return card != null
            && card.getSpec() != null
            && card.getSpec().getState() == PublishState.PUBLISHED
            && notDeleting(card);
    }

    /** 可进入列表、专题、搜索：已发布且原文未撤回。 */
    public static boolean isListed(ResourceCard card) {
        return isPublic(card) && card.getSpec().getLinkStatus() != LinkStatus.SOURCE_RETRACTED;
    }

    public static boolean isPublic(Topic topic) {
        return topic != null
            && topic.getSpec() != null
            && topic.getSpec().getState() == PublishState.PUBLISHED
            && notDeleting(topic);
    }

    private static boolean notDeleting(run.halo.app.extension.Extension ext) {
        return ext.getMetadata() == null || ext.getMetadata().getDeletionTimestamp() == null;
    }
}
