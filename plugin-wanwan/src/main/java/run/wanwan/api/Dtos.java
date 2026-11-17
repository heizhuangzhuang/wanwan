package run.wanwan.api;

import java.util.List;
import java.util.Set;
import run.wanwan.model.Enums.AccessCondition;
import run.wanwan.model.Enums.EntryType;
import run.wanwan.model.Enums.Language;
import run.wanwan.model.Enums.LinkStatus;
import run.wanwan.model.Enums.MaterialType;
import run.wanwan.model.ResourceCard;
import run.wanwan.model.Stage;
import run.wanwan.model.Topic;

/**
 * 公开接口的白名单 DTO。只在这里决定哪些字段可以出站；不返回 Halo 对象本身。
 */
public final class Dtos {

    private Dtos() {
    }

    public record StageView(String key, String label, int order) {
        public static StageView of(Stage stage) {
            return new StageView(stage.name(), stage.getLabel(), stage.ordinal());
        }
    }

    public record Entry(EntryType type, String url, String appId, String path) {
        public static Entry citationOnly() {
            return new Entry(EntryType.CITATION_ONLY, null, null, null);
        }
    }

    public record ResourceView(
        String name,
        String title,
        String originalTitle,
        String intro,
        String sourceName,
        String author,
        String publishedDate,
        String lastVerifiedDate,
        Set<Stage> stages,
        MaterialType materialType,
        Set<String> tags,
        Language language,
        AccessCondition access,
        String doi,
        String pmid,
        String storyContext,
        LinkStatus linkStatus,
        /** 原始 URL 仅作为可核对出处展示；能否打开以 entry 为准。 */
        String citationUrl,
        Entry entry
    ) {
        public static ResourceView of(ResourceCard card) {
            var s = card.getSpec();
            String title = s.getDisplayTitle() != null && !s.getDisplayTitle().isBlank()
                ? s.getDisplayTitle() : s.getOriginalTitle();
            return new ResourceView(
                card.getMetadata().getName(),
                title,
                s.getOriginalTitle(),
                s.getIntro(),
                s.getSourceName(),
                s.getAuthor(),
                s.getPublishedDate(),
                s.getLastVerifiedDate(),
                s.getStages(),
                s.getMaterialType(),
                s.getTags(),
                s.getLanguage(),
                s.getAccess(),
                s.getDoi(),
                s.getPmid(),
                s.getStoryContext(),
                s.getLinkStatus(),
                EntryResolver.isSafeHttpUrl(s.getUrl()) ? s.getUrl() : null,
                EntryResolver.resolve(s)
            );
        }
    }

    public record TopicSummary(String name, String title, String intro, int resourceCount) {
        public static TopicSummary of(Topic topic) {
            var s = topic.getSpec();
            return new TopicSummary(topic.getMetadata().getName(), s.getTitle(), s.getIntro(),
                s.getResourceNames() == null ? 0 : s.getResourceNames().size());
        }
    }

    public record TopicView(String name, String title, String intro, List<ResourceView> resources) {
    }

    public record Page<T>(int page, int size, long total, List<T> items) {
    }
}
