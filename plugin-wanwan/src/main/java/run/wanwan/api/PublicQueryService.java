package run.wanwan.api;

import static run.halo.app.extension.index.query.Queries.equal;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import run.halo.app.content.PostContentService;
import run.halo.app.core.extension.User;
import run.halo.app.core.extension.content.Category;
import run.halo.app.core.extension.content.Post;
import run.halo.app.core.extension.content.Tag;
import run.halo.app.extension.ExtensionOperator;
import run.halo.app.extension.ListOptions;
import run.halo.app.extension.PageRequestImpl;
import run.halo.app.extension.ReactiveExtensionClient;
import run.wanwan.model.Enums.MaterialType;
import run.wanwan.model.ResourceCard;
import run.wanwan.model.Stage;
import run.wanwan.model.Topic;
import run.wanwan.model.Visibility;
import run.wanwan.search.SearchIndex;

/**
 * 公开读取服务。独立 Web 前端与小程序共用，保证双端可见性规则一致。
 */
@Component
@RequiredArgsConstructor
public class PublicQueryService {

    public static final int MAX_PAGE_SIZE = 50;
    public static final String IDX_LISTED = "spec.listed";
    public static final String IDX_STAGES = "spec.stages";
    public static final String IDX_TYPE = "spec.materialType";
    public static final String IDX_TAGS = "spec.tags";
    public static final String IDX_PRIORITY = "spec.priority";
    public static final String IDX_TOPIC_PUBLIC = "spec.public";

    private static final Comparator<Post> POST_ORDER = Comparator
        .comparing((Post p) -> p.getSpec().getPublishTime(), Comparator.nullsLast(Comparator.reverseOrder()))
        .thenComparing(p -> p.getMetadata().getName());

    private final ReactiveExtensionClient client;
    private final PostContentService postContentService;
    private final SearchIndex searchIndex;

    public Mono<Dtos.Page<Dtos.ResourceView>> listResources(Stage stage, MaterialType type,
                                                           String tag, int page, int size) {
        var builder = ListOptions.builder().andQuery(equal(IDX_LISTED, "true"));
        if (stage != null) {
            builder.andQuery(equal(IDX_STAGES, stage.name()));
        }
        if (type != null) {
            builder.andQuery(equal(IDX_TYPE, type.name()));
        }
        if (tag != null && !tag.isBlank()) {
            builder.andQuery(equal(IDX_TAGS, tag));
        }
        var sort = Sort.by(Sort.Order.asc(IDX_PRIORITY), Sort.Order.asc("metadata.name"));
        int p = normalizePage(page);
        int s = normalizeSize(size);
        return client.listBy(ResourceCard.class, builder.build(), PageRequestImpl.of(p, s, sort))
            .map(result -> new Dtos.Page<>(p, s, result.getTotal(),
                result.getItems().stream()
                    // 二次核验，防御索引与主数据不一致
                    .filter(Visibility::isListed)
                    .map(Dtos.ResourceView::of)
                    .toList()));
    }

    /** 详情：未发布、已删除统一视为不存在。原文撤回的资料仍可访问详情，但入口降级。 */
    public Mono<Dtos.ResourceView> getResource(String name) {
        return client.fetch(ResourceCard.class, name)
            .filter(Visibility::isPublic)
            .map(Dtos.ResourceView::of);
    }

    public Mono<Dtos.Page<Dtos.TopicSummary>> listTopics(int page, int size) {
        var options = ListOptions.builder().andQuery(equal(IDX_TOPIC_PUBLIC, "true")).build();
        var sort = Sort.by(Sort.Order.asc(IDX_PRIORITY), Sort.Order.asc("metadata.name"));
        int p = normalizePage(page);
        int s = normalizeSize(size);
        return client.listBy(Topic.class, options, PageRequestImpl.of(p, s, sort))
            .flatMap(result -> Flux.fromIterable(result.getItems())
                .filter(Visibility::isPublic)
                .concatMap(topic -> listedTopicResources(topic)
                    .count()
                    .map(count -> Dtos.TopicSummary.of(topic, count.intValue())))
                .collectList()
                .map(items -> new Dtos.Page<>(p, s, result.getTotal(), items)));
    }

    /** 专题详情：按编辑顺序返回，未列出的资料静默剔除。 */
    public Mono<Dtos.TopicView> getTopic(String name) {
        return client.fetch(Topic.class, name)
            .filter(Visibility::isPublic)
            .flatMap(topic -> listedTopicResources(topic)
                .map(Dtos.ResourceView::of)
                .collectList()
                .map(items -> new Dtos.TopicView(topic.getMetadata().getName(),
                    topic.getSpec().getTitle(), topic.getSpec().getIntro(), items)));
    }

    private Flux<ResourceCard> listedTopicResources(Topic topic) {
        List<String> names = topic.getSpec().getResourceNames() == null
            ? List.of() : topic.getSpec().getResourceNames();
        return Flux.fromIterable(names)
            .distinct()
            .flatMapSequential(name -> client.fetch(ResourceCard.class, name), 4)
            .filter(Visibility::isListed);
    }

    private static final Set<String> LITERATURE_TAG_SLUGS = Set.of(
        "literature", "literature-translation", "paper", "paper-translation"
    );
    private static final Set<String> LITERATURE_TAG_NAMES = Set.of(
        "文献译读", "论文译读", "文献翻译", "论文翻译"
    );

    /** 本站原创导读列表：仅返回已发布且公开的文章。 */
    public Mono<Dtos.Page<Dtos.PostSummary>> listPosts(int page, int size) {
        return listPosts(page, size, null);
    }

    public Mono<Dtos.Page<Dtos.PostSummary>> listPosts(int page, int size, String kind) {
        return pagePosts("", null, kind, page, size);
    }

    public Mono<Dtos.Page<Dtos.PostSummary>> listStagePosts(Stage stage, int page, int size) {
        return listStagePosts(stage, page, size, null);
    }

    public Mono<Dtos.Page<Dtos.PostSummary>> listStagePosts(Stage stage, int page, int size, String kind) {
        return pagePosts("", stage, kind, page, size);
    }

    private Mono<Dtos.Page<Dtos.PostSummary>> pagePosts(String keyword, Stage stage, String kind, int page, int size) {
        int p = normalizePage(page);
        int s = normalizeSize(size);
        String normalizedKind = normalizeArticleKind(kind);
        List<String> terms = keyword.isEmpty() ? List.of()
            : java.util.Arrays.stream(keyword.split("\\s+")).filter(t -> !t.isEmpty()).toList();
        return literatureTagNames()
            .flatMap(litTags -> stagePosts(stage)
                .filter(post -> terms.isEmpty() || matchesAllTerms(post, terms))
                .filter(post -> matchesKind(post, litTags, normalizedKind))
                .collectList()
                .flatMap(all -> Flux.fromIterable(pageSlice(all, p, s))
                    .flatMapSequential(post -> {
                        boolean lit = hasLiteratureTag(post, litTags);
                        Mono<String> fallbackCover = Dtos.publicCover(post) != null
                            ? Mono.just("")
                            : firstImageFromRelease(post.getMetadata().getName()).defaultIfEmpty("");
                        return Mono.zip(publicAuthor(post).defaultIfEmpty(""), fallbackCover)
                            .map(tuple -> Dtos.PostSummary.of(
                                post,
                                tuple.getT1().isEmpty() ? null : tuple.getT1(),
                                lit,
                                tuple.getT2().isEmpty() ? null : tuple.getT2()));
                    }, 4)
                    .collectList()
                    .map(items -> new Dtos.Page<>(p, s, all.size(), items))));
    }

    private Mono<String> firstImageFromRelease(String postName) {
        var release = postContentService.getReleaseContent(postName);
        if (release == null) return Mono.empty();
        return release
            .mapNotNull(content -> Dtos.firstContentImage(content.getContent()))
            .onErrorResume(err -> Mono.empty());
    }

    private Mono<Set<String>> literatureTagNames() {
        Flux<Tag> tags = client.list(Tag.class, tag -> {
            var spec = tag.getSpec();
            if (ExtensionOperator.isDeleted(tag) || spec == null) return false;
            String slug = spec.getSlug() != null ? spec.getSlug().trim().toLowerCase(Locale.ROOT) : "";
            String display = spec.getDisplayName() != null ? spec.getDisplayName().trim() : "";
            return LITERATURE_TAG_SLUGS.contains(slug) || LITERATURE_TAG_NAMES.contains(display);
        }, Comparator.comparing(tag -> tag.getMetadata().getName()));
        if (tags == null) return Mono.just(Set.of());
        return tags.map(tag -> tag.getMetadata().getName())
            .collect(java.util.stream.Collectors.toSet());
    }

    private static boolean hasLiteratureTag(Post post, Set<String> literatureTags) {
        if (literatureTags.isEmpty() || post.getSpec() == null || post.getSpec().getTags() == null) return false;
        return post.getSpec().getTags().stream().anyMatch(literatureTags::contains);
    }

    private static boolean isLiteraturePost(Post post, Set<String> literatureTags) {
        return hasLiteratureTag(post, literatureTags) || Dtos.LiteratureCitation.hasLiteratureAnnotation(post);
    }

    private static boolean matchesKind(Post post, Set<String> literatureTags, String normalizedKind) {
        if (normalizedKind == null) return true;
        boolean lit = isLiteraturePost(post, literatureTags);
        return "LITERATURE".equals(normalizedKind) ? lit : !lit;
    }

    private static String normalizeArticleKind(String kind) {
        if (kind == null || kind.isBlank()) return null;
        String upper = kind.trim().toUpperCase(Locale.ROOT);
        if ("LITERATURE".equals(upper) || "GUIDE".equals(upper)) return upper;
        return null;
    }

    private static boolean matchesAllTerms(Post post, List<String> terms) {
        String title = post.getSpec().getTitle();
        String excerpt = post.getStatus() != null ? post.getStatus().getExcerpt() : null;
        for (String term : terms) {
            if (!containsKeyword(title, term) && !containsKeyword(excerpt, term)) {
                return false;
            }
        }
        return true;
    }

    private Flux<Post> stagePosts(Stage stage) {
        if (stage == null) return client.list(Post.class, Visibility::isPublicPost, POST_ORDER);
        String slug = stage.name().toLowerCase(Locale.ROOT).replace('_', '-');
        return client.list(Category.class, category -> {
                var spec = category.getSpec();
                return !ExtensionOperator.isDeleted(category) && spec != null
                    && (slug.equalsIgnoreCase(spec.getSlug()) || stage.getLabel().equals(spec.getDisplayName()));
            }, Comparator.comparing(category -> category.getMetadata().getName()))
            .map(category -> category.getMetadata().getName())
            .collect(java.util.stream.Collectors.toSet())
            .flatMapMany(categories -> categories.isEmpty() ? Flux.empty()
                : client.list(Post.class, post -> Visibility.isPublicPost(post) && post.getSpec().getCategories() != null
                    && post.getSpec().getCategories().stream().anyMatch(categories::contains), POST_ORDER));
    }

    private static boolean containsKeyword(String text, String keyword) {
        return text != null && text.toLowerCase(Locale.ROOT).contains(keyword);
    }

    /** 本站原创导读详情只读 releaseSnapshot。 */
    public Mono<Dtos.PostView> getPost(String name) {
        return client.fetch(Post.class, name)
            .filter(Visibility::isPublicPost)
            .flatMap(post -> Mono.zip(postContentService.getReleaseContent(name), literatureTagNames())
                .flatMap(tuple -> {
                    boolean lit = hasLiteratureTag(post, tuple.getT2());
                    String html = tuple.getT1().getContent();
                    return publicAuthor(post)
                        .map(author -> Dtos.PostView.of(post, html, author, lit))
                        .defaultIfEmpty(Dtos.PostView.of(post, html, null, lit));
                }));
    }

    private Mono<String> publicAuthor(Post post) {
        String owner = post.getSpec().getOwner();
        if (owner == null || owner.isBlank()) return Mono.empty();
        return client.fetch(User.class, owner)
            .filter(user -> !ExtensionOperator.isDeleted(user) && user.getSpec() != null)
            .mapNotNull(user -> user.getSpec().getDisplayName())
            .filter(name -> !name.isBlank());
    }

    private static <T> List<T> pageSlice(List<T> list, int page, int size) {
        int from = (int) Math.min((long) (page - 1) * size, list.size());
        int to = (int) Math.min((long) from + size, list.size());
        return list.subList(from, to);
    }

    public Mono<Dtos.Page<Dtos.ResourceView>> search(String keyword, Stage stage, MaterialType type,
                                                    int page, int size) {
        int p = normalizePage(page);
        int s = normalizeSize(size);
        List<String> names = searchIndex.search(keyword, stage, type);
        return Flux.fromIterable(pageSlice(names, p, s))
            .concatMap(n -> client.fetch(ResourceCard.class, n))
            // ADR-003：返回前按主数据核验
            .filter(Visibility::isListed)
            .map(Dtos.ResourceView::of)
            .collectList()
            .map(items -> new Dtos.Page<>(p, s, names.size(), items));
    }

    public Mono<Dtos.SearchPage> searchWithGuides(String keyword, Stage stage, MaterialType type,
                                                 int page, int size) {
        String term = keyword.strip().toLowerCase(Locale.ROOT);
        var guides = !term.isEmpty() && (type == null || type == MaterialType.ORIGINAL)
            ? pagePosts(term, stage, null, page, size)
            : Mono.just(new Dtos.Page<Dtos.PostSummary>(normalizePage(page), normalizeSize(size), 0, List.of()));
        return Mono.zip(search(keyword, stage, type, page, size), guides, Dtos.SearchPage::of);
    }

    static int normalizePage(int page) {
        return Math.max(page, 1);
    }

    static int normalizeSize(int size) {
        if (size <= 0) {
            return 20;
        }
        return Math.min(size, MAX_PAGE_SIZE);
    }
}
