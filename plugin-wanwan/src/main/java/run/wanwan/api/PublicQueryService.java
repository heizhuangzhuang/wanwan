package run.wanwan.api;

import static run.halo.app.extension.index.query.Queries.equal;

import java.util.Comparator;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import run.halo.app.content.PostContentService;
import run.halo.app.core.extension.content.Post;
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

    /** 本站原创导读列表：仅返回已发布且公开的文章。 */
    public Mono<Dtos.Page<Dtos.PostSummary>> listPosts(int page, int size) {
        int p = normalizePage(page);
        int s = normalizeSize(size);
        return client.list(Post.class, Visibility::isPublicPost, POST_ORDER)
            .collectList()
            .map(all -> {
                int from = Math.min((p - 1) * s, all.size());
                int to = Math.min(from + s, all.size());
                var items = all.subList(from, to).stream().map(Dtos.PostSummary::of).toList();
                return new Dtos.Page<>(p, s, all.size(), items);
            });
    }

    /** 本站原创导读详情：只读 releaseSnapshot，绝不泄露未发布草稿正文。 */
    public Mono<Dtos.PostView> getPost(String name) {
        return client.fetch(Post.class, name)
            .filter(Visibility::isPublicPost)
            .flatMap(post -> postContentService.getReleaseContent(name)
                .map(cw -> Dtos.PostView.of(post, cw.getContent())));
    }

    public Mono<Dtos.Page<Dtos.ResourceView>> search(String keyword, Stage stage, MaterialType type,
                                                    int page, int size) {
        int p = normalizePage(page);
        int s = normalizeSize(size);
        List<String> names = searchIndex.search(keyword, stage, type);
        int from = Math.min((p - 1) * s, names.size());
        int to = Math.min(from + s, names.size());
        return Flux.fromIterable(names.subList(from, to))
            .concatMap(n -> client.fetch(ResourceCard.class, n))
            // ADR-003：返回前按主数据核验
            .filter(Visibility::isListed)
            .map(Dtos.ResourceView::of)
            .collectList()
            .map(items -> new Dtos.Page<>(p, s, names.size(), items));
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
