package run.wanwan.api;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import run.halo.app.core.extension.content.Post;
import run.wanwan.model.Enums.AccessCondition;
import run.wanwan.model.Enums.EntryType;
import run.wanwan.model.Enums.Language;
import run.wanwan.model.Enums.LinkStatus;
import run.wanwan.model.Enums.MaterialType;
import run.wanwan.model.ResourceCard;
import run.wanwan.model.Stage;
import run.wanwan.model.Topic;
import run.wanwan.model.Visibility;

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

    public record Attachment(String fileName, String url) {
        private static final Set<String> TYPES = Set.of("pdf", "doc", "docx", "xls", "xlsx",
            "ppt", "pptx", "jpg", "jpeg", "png", "gif", "webp", "zip");

        static Attachment of(ResourceCard card) {
            var spec = card.getSpec();
            if (!Visibility.isListed(card) || spec.getLinkStatus() != LinkStatus.OK || !spec.isDownloadApproved()) {
                return null;
            }
            String url = spec.getDownloadUrl();
            String name = spec.getDownloadFileName();
            if (url == null || !url.strip().toLowerCase(Locale.ROOT).startsWith("https://")
                || !EntryResolver.isSafeHttpUrl(url) || name == null || name.length() > 80
                || name.indexOf('/') >= 0 || name.indexOf('\\') >= 0
                || name.chars().anyMatch(Character::isISOControl)) {
                return null;
            }
            int dot = name.lastIndexOf('.');
            return dot > 0 && TYPES.contains(name.substring(dot + 1).toLowerCase(Locale.ROOT))
                ? new Attachment(name, url.strip()) : null;
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
        Entry entry,
        Attachment attachment
    ) {
        public static ResourceView of(ResourceCard card) {
            var s = card.getSpec();
            return new ResourceView(
                card.getMetadata().getName(),
                s.title(),
                s.getOriginalTitle(),
                s.getIntro(),
                s.getSourceName(),
                s.getAuthor(),
                s.getPublishedDate(),
                s.getLastVerifiedDate(),
                s.getStages() == null ? Set.of() : s.getStages(),
                s.getMaterialType(),
                s.getTags() == null ? Set.of() : s.getTags(),
                s.getLanguage(),
                s.getAccess(),
                s.getDoi(),
                s.getPmid(),
                s.getStoryContext(),
                s.getLinkStatus(),
                EntryResolver.isSafeHttpUrl(s.getUrl()) ? s.getUrl() : null,
                EntryResolver.resolve(s),
                Attachment.of(card)
            );
        }
    }

    public record TopicSummary(String name, String title, String intro, int resourceCount) {
        public static TopicSummary of(Topic topic, int resourceCount) {
            var s = topic.getSpec();
            return new TopicSummary(topic.getMetadata().getName(), s.getTitle(), s.getIntro(),
                resourceCount);
        }
    }

    public record TopicView(String name, String title, String intro, List<ResourceView> resources) {
    }

    /** 本站原创导读摘要（来自 Halo 已发布 Post，仅白名单公开字段）。 */
    public record PostSummary(String name, String title, String excerpt, Instant publishTime, String author) {
        public static PostSummary of(Post post, String author) {
            String excerpt = post.getStatus() != null ? post.getStatus().getExcerpt() : null;
            return new PostSummary(
                post.getMetadata().getName(),
                post.getSpec().getTitle(),
                excerpt,
                post.getSpec().getPublishTime(),
                author
            );
        }
    }

    /** 本站原创导读详情（仅返回已发布快照正文）。 */
    public record PostView(String name, String title, String excerpt, Instant publishTime, String content, String author) {
        public static PostView of(Post post, String content, String author) {
            String excerpt = post.getStatus() != null ? post.getStatus().getExcerpt() : null;
            return new PostView(
                post.getMetadata().getName(),
                post.getSpec().getTitle(),
                excerpt,
                post.getSpec().getPublishTime(),
                content,
                author
            );
        }
    }

    public record Page<T>(int page, int size, long total, List<T> items) {
    }

    public record SearchPage(int page, int size, long total, List<ResourceView> items,
                             long guideTotal, List<PostSummary> guideItems) {
        public static SearchPage of(Page<ResourceView> resources, Page<PostSummary> guides) {
            return new SearchPage(resources.page(), resources.size(), resources.total(),
                resources.items(), guides.total(), guides.items());
        }
    }
}
