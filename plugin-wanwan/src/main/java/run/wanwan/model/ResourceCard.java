package run.wanwan.model;

import java.util.LinkedHashSet;
import java.util.Set;
import lombok.Data;
import lombok.EqualsAndHashCode;
import run.halo.app.extension.AbstractExtension;
import run.halo.app.extension.GVK;
import run.wanwan.model.Enums.AccessCondition;
import run.wanwan.model.Enums.EntryType;
import run.wanwan.model.Enums.Language;
import run.wanwan.model.Enums.LinkStatus;
import run.wanwan.model.Enums.MaterialType;
import run.wanwan.model.Enums.PublishState;

/**
 * 外部资料卡（ADR-001）。只保存题录、自写短介绍与合法原文入口，不保存第三方正文。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@GVK(group = "wanwan.run", version = "v1alpha1", kind = "ResourceCard",
    plural = "resourcecards", singular = "resourcecard")
public class ResourceCard extends AbstractExtension {

    private Spec spec = new Spec();

    @Data
    public static class Spec {
        /** 原标题，默认展示。 */
        private String originalTitle;
        /** 本站拟写的中文辅助标题，可空。 */
        private String displayTitle;
        /** 运营者独立撰写的 1~3 句介绍，不复制原文摘要。 */
        private String intro;

        private String url;
        private String sourceName;
        private String author;
        /** 原文发布日期，原文无日期时为空（展示"未注明"）。 */
        private String publishedDate;
        private String lastVerifiedDate;

        private Set<Stage> stages = new LinkedHashSet<>();
        private MaterialType materialType;
        private Set<String> tags = new LinkedHashSet<>();
        private Language language = Language.ZH;
        private AccessCondition access = AccessCondition.UNKNOWN;

        private String doi;
        private String pmid;
        /** 家庭经历的发生/随访时点。 */
        private String storyContext;

        private EntryType entryType = EntryType.CITATION_ONLY;
        /** 小程序入口：appId。 */
        private String miniProgramAppId;
        /** 小程序入口：页面路径。 */
        private String miniProgramPath;

        private LinkStatus linkStatus = LinkStatus.UNCHECKED;
        private PublishState state = PublishState.DRAFT;
        /** 人工推荐顺序，越小越靠前。 */
        private Integer priority = 1000;

        public String title() {
            return displayTitle != null && !displayTitle.isBlank() ? displayTitle : originalTitle;
        }
    }
}
