package run.wanwan.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import run.halo.app.content.ContentWrapper;
import run.halo.app.content.PostContentService;
import run.halo.app.core.extension.User;
import run.halo.app.core.extension.content.Category;
import run.halo.app.core.extension.content.Post;
import run.halo.app.core.extension.content.Tag;
import run.halo.app.extension.ListResult;
import run.halo.app.extension.Metadata;
import run.halo.app.extension.ReactiveExtensionClient;
import run.wanwan.model.Enums.EntryType;
import run.wanwan.model.Enums.LinkStatus;
import run.wanwan.model.Enums.MaterialType;
import run.wanwan.model.Enums.PublishState;
import run.wanwan.model.ResourceCard;
import run.wanwan.model.Stage;
import run.wanwan.model.Topic;
import run.wanwan.search.SearchIndex;

class PublicQueryServiceTest {

    static ResourceCard card(String name, PublishState state, LinkStatus linkStatus) {
        var c = new ResourceCard();
        var m = new Metadata();
        m.setName(name);
        c.setMetadata(m);
        c.getSpec().setOriginalTitle("Title " + name);
        c.getSpec().setIntro("Intro " + name);
        c.getSpec().setUrl("https://example.com/" + name);
        c.getSpec().setEntryType(EntryType.WEB);
        c.getSpec().setState(state);
        c.getSpec().setLinkStatus(linkStatus);
        c.getSpec().setStages(Set.of(Stage.JUST_FOUND));
        c.getSpec().setMaterialType(MaterialType.INSTITUTION);
        return c;
    }

    static Topic topic(String name, PublishState state, List<String> resourceNames) {
        var t = new Topic();
        var m = new Metadata();
        m.setName(name);
        t.setMetadata(m);
        t.getSpec().setTitle("Topic " + name);
        t.getSpec().setIntro("Topic intro");
        t.getSpec().setState(state);
        t.getSpec().setResourceNames(resourceNames);
        return t;
    }

    static Post post(String name, boolean published, Post.VisibleEnum visible, boolean deleted) {
        var p = new Post();
        var m = new Metadata();
        m.setName(name);
        m.setLabels(Map.of(Post.PUBLISHED_LABEL, String.valueOf(published)));
        p.setMetadata(m);
        p.setSpec(new Post.PostSpec());
        p.getSpec().setTitle("Post " + name);
        p.getSpec().setVisible(visible);
        p.getSpec().setDeleted(deleted);
        p.getSpec().setPublishTime(Instant.parse("2026-11-17T00:00:00Z"));
        p.getStatusOrDefault().setExcerpt("Excerpt " + name);
        return p;
    }

    static PublicQueryService service(ReactiveExtensionClient client, PostContentService posts,
                                      SearchIndex index) {
        return new PublicQueryService(client, posts, index);
    }

    @Test
    void onlyApprovedHttpsAttachmentsFromListedCardsAreExposed() {
        var resource = card("file", PublishState.PUBLISHED, LinkStatus.OK);
        var spec = resource.getSpec();
        spec.setDownloadFileName("可下载文件.xlsx");
        spec.setDownloadUrl("https://example.com/attachment");
        assertThat(Dtos.ResourceView.of(resource).attachment()).isNull();

        spec.setDownloadApproved(true);
        assertThat(Dtos.ResourceView.of(resource).attachment().fileName()).isEqualTo("可下载文件.xlsx");
        spec.setDownloadUrl("http://example.com/attachment");
        assertThat(Dtos.ResourceView.of(resource).attachment()).isNull();
        spec.setDownloadUrl("https://example.com/attachment");
        spec.setDownloadFileName("../附件.pdf");
        assertThat(Dtos.ResourceView.of(resource).attachment()).isNull();
        spec.setDownloadFileName("附件.zip");
        spec.setLinkStatus(LinkStatus.SOURCE_RETRACTED);
        assertThat(Dtos.ResourceView.of(resource).attachment()).isNull();
        spec.setLinkStatus(LinkStatus.OK);
        spec.setState(PublishState.WITHDRAWN);
        assertThat(Dtos.ResourceView.of(resource).attachment()).isNull();
    }

    @Test
    void draftWithdrawnAndDeletingCardsAreHiddenFromDetail() {
        var client = mock(ReactiveExtensionClient.class);
        var service = service(client, mock(PostContentService.class), new SearchIndex());

        var deleting = card("del", PublishState.PUBLISHED, LinkStatus.OK);
        deleting.getMetadata().setDeletionTimestamp(Instant.now());

        when(client.fetch(ResourceCard.class, "draft"))
            .thenReturn(Mono.just(card("draft", PublishState.DRAFT, LinkStatus.OK)));
        when(client.fetch(ResourceCard.class, "withdrawn"))
            .thenReturn(Mono.just(card("withdrawn", PublishState.WITHDRAWN, LinkStatus.OK)));
        when(client.fetch(ResourceCard.class, "del"))
            .thenReturn(Mono.just(deleting));
        when(client.fetch(ResourceCard.class, "pub"))
            .thenReturn(Mono.just(card("pub", PublishState.PUBLISHED, LinkStatus.OK)));

        assertThat(service.getResource("draft").blockOptional()).isEmpty();
        assertThat(service.getResource("withdrawn").blockOptional()).isEmpty();
        assertThat(service.getResource("del").blockOptional()).isEmpty();
        assertThat(service.getResource("pub").blockOptional()).isPresent();
    }

    @Test
    void retractedCardDetailDowngradesEntryToCitationOnly() {
        var client = mock(ReactiveExtensionClient.class);
        var service = service(client, mock(PostContentService.class), new SearchIndex());

        when(client.fetch(ResourceCard.class, "ret"))
            .thenReturn(Mono.just(card("ret", PublishState.PUBLISHED, LinkStatus.SOURCE_RETRACTED)));

        var view = service.getResource("ret").block();
        assertThat(view).isNotNull();
        assertThat(view.entry().type()).isEqualTo(EntryType.CITATION_ONLY);
        assertThat(view.entry().url()).isNull();
    }

    @Test
    void topicFiltersOutNonListedCardsAndPreservesOrder() {
        var client = mock(ReactiveExtensionClient.class);
        var service = service(client, mock(PostContentService.class), new SearchIndex());

        var t1 = topic("t1", PublishState.PUBLISHED, List.of("r2", "draft", "r1", "ret", "r2", "missing"));
        when(client.fetch(Topic.class, "t1")).thenReturn(Mono.just(t1));
        when(client.listBy(eq(Topic.class), any(), any()))
            .thenReturn(Mono.just(new ListResult<>(1, 20, 1, List.of(t1))));
        when(client.fetch(ResourceCard.class, "missing")).thenReturn(Mono.empty());
        when(client.fetch(ResourceCard.class, "r2"))
            .thenReturn(Mono.just(card("r2", PublishState.PUBLISHED, LinkStatus.OK)));
        when(client.fetch(ResourceCard.class, "draft"))
            .thenReturn(Mono.just(card("draft", PublishState.DRAFT, LinkStatus.OK)));
        when(client.fetch(ResourceCard.class, "r1"))
            .thenReturn(Mono.just(card("r1", PublishState.PUBLISHED, LinkStatus.OK)));
        when(client.fetch(ResourceCard.class, "ret"))
            .thenReturn(Mono.just(card("ret", PublishState.PUBLISHED, LinkStatus.SOURCE_RETRACTED)));

        var view = service.getTopic("t1").block();
        assertThat(view).isNotNull();
        assertThat(view.resources()).extracting(Dtos.ResourceView::name).containsExactly("r2", "r1");
        assertThat(service.listTopics(1, 20).block().items())
            .extracting(Dtos.TopicSummary::resourceCount)
            .containsExactly(view.resources().size());
    }

    @Test
    void searchDoubleChecksPrimaryDataBeforeReturning() {
        var client = mock(ReactiveExtensionClient.class);
        var index = new SearchIndex();
        var r1 = card("r1", PublishState.PUBLISHED, LinkStatus.OK);
        var r2 = card("r2", PublishState.PUBLISHED, LinkStatus.OK);
        index.upsert(r1);
        index.upsert(r2);

        // 模拟 r2 在主数据中已被撤回，但索引尚未刷新
        var r2Withdrawn = card("r2", PublishState.WITHDRAWN, LinkStatus.OK);
        when(client.fetch(ResourceCard.class, "r1")).thenReturn(Mono.just(r1));
        when(client.fetch(ResourceCard.class, "r2")).thenReturn(Mono.just(r2Withdrawn));

        var service = service(client, mock(PostContentService.class), index);
        var result = service.search("Title", null, null, 1, 20).block();
        assertThat(result).isNotNull();
        assertThat(result.items()).extracting(Dtos.ResourceView::name).containsExactly("r1");
    }

    @Test
    void listResourcesDefensivelyFiltersStaleIndexItems() {
        var client = mock(ReactiveExtensionClient.class);
        var service = service(client, mock(PostContentService.class), new SearchIndex());
        var pub = card("pub", PublishState.PUBLISHED, LinkStatus.OK);
        var draft = card("draft", PublishState.DRAFT, LinkStatus.OK);
        when(client.listBy(eq(ResourceCard.class), any(), any()))
            .thenReturn(Mono.just(new ListResult<>(1, 20, 2, List.of(pub, draft))));

        var page = service.listResources(null, null, null, 1, 20).block();
        assertThat(page).isNotNull();
        assertThat(page.items()).extracting(Dtos.ResourceView::name).containsExactly("pub");
    }

    @Test
    void onlyPublishedPublicPostsAreVisibleAndUseReleaseContent() {
        var client = mock(ReactiveExtensionClient.class);
        var postContent = mock(PostContentService.class);
        var service = service(client, postContent, new SearchIndex());

        var pub = post("guide-1", true, Post.VisibleEnum.PUBLIC, false);
        pub.getSpec().setOwner("author-login");
        var author = new User();
        author.setMetadata(new Metadata());
        author.getMetadata().setName("author-login");
        author.setSpec(new User.UserSpec());
        author.getSpec().setDisplayName("公开署名");
        when(client.fetch(User.class, "author-login")).thenReturn(Mono.just(author));
        var priv = post("guide-priv", true, Post.VisibleEnum.PRIVATE, false);
        var draft = post("guide-draft", false, Post.VisibleEnum.PUBLIC, false);
        var deleted = post("guide-del", true, Post.VisibleEnum.PUBLIC, true);

        when(client.fetch(Post.class, "guide-1")).thenReturn(Mono.just(pub));
        when(client.fetch(Post.class, "guide-priv")).thenReturn(Mono.just(priv));
        when(client.fetch(Post.class, "guide-draft")).thenReturn(Mono.just(draft));
        when(client.fetch(Post.class, "guide-del")).thenReturn(Mono.just(deleted));
        when(postContent.getReleaseContent("guide-1"))
            .thenReturn(Mono.just(ContentWrapper.builder().content("<p>已发布正文</p>").build()));
        when(client.list(eq(Post.class), any(), any())).thenReturn(Flux.just(pub));

        assertThat(service.getPost("guide-priv").blockOptional()).isEmpty();
        assertThat(service.getPost("guide-draft").blockOptional()).isEmpty();
        assertThat(service.getPost("guide-del").blockOptional()).isEmpty();
        var view = service.getPost("guide-1").block();
        assertThat(view).isNotNull();
        assertThat(view.content()).isEqualTo("<p>已发布正文</p>");
        assertThat(view.author()).isEqualTo("公开署名");
        assertThat(service.listPosts(1, 20).block().items())
            .extracting(Dtos.PostSummary::name).containsExactly("guide-1");
        assertThat(service.listPosts(Integer.MAX_VALUE, 50).block().items()).isEmpty();
        assertThat(service.listPosts(1, 20).block().items())
            .extracting(Dtos.PostSummary::author).containsExactly("公开署名");
    }

    @Test
    void searchIncludesOnlyMatchingPublishedGuidesAndRespectsFilters() {
        var client = mock(ReactiveExtensionClient.class);
        var service = service(client, mock(PostContentService.class), new SearchIndex());
        var title = post("a-title", true, Post.VisibleEnum.PUBLIC, false);
        title.getSpec().setTitle("CMA 阅读指南");
        var excerpt = post("b-excerpt", true, Post.VisibleEnum.PUBLIC, false);
        excerpt.getStatusOrDefault().setExcerpt("准备 CMA 检查资料");
        var draft = post("cma-draft", false, Post.VisibleEnum.PUBLIC, false);
        var privatePost = post("cma-private", true, Post.VisibleEnum.PRIVATE, false);
        var unrelated = post("other", true, Post.VisibleEnum.PUBLIC, false);
        var category = new Category();
        var metadata = new Metadata();
        metadata.setName("category-generated-id");
        category.setMetadata(metadata);
        var spec = new Category.CategorySpec();
        spec.setDisplayName("刚发现");
        spec.setSlug("gang-fa-xian");
        category.setSpec(spec);
        for (var classified : List.of(title, draft, privatePost)) {
            classified.getSpec().setCategories(List.of("category-generated-id"));
        }
        when(client.list(eq(Category.class), any(), any())).thenAnswer(call -> {
            Predicate<Category> filter = call.getArgument(1);
            return Flux.just(category).filter(filter);
        });
        when(client.list(eq(Post.class), any(), any())).thenAnswer(call -> {
            Predicate<Post> filter = call.getArgument(1);
            return Flux.just(title, excerpt, draft, privatePost, unrelated).filter(filter);
        });

        var first = service.searchWithGuides(" cma ", null, null, 1, 1).block();
        assertThat(first.total()).isZero();
        assertThat(first.guideTotal()).isEqualTo(2);
        assertThat(first.guideItems()).extracting(Dtos.PostSummary::name).containsExactly("a-title");
        var second = service.searchWithGuides("CMA", null, MaterialType.ORIGINAL, 2, 1).block();
        assertThat(second.guideItems()).extracting(Dtos.PostSummary::name).containsExactly("b-excerpt");
        assertThat(service.listStagePosts(Stage.JUST_FOUND, 1, 3).block().items())
            .extracting(Dtos.PostSummary::name).containsExactly("a-title");
        assertThat(service.searchWithGuides("CMA", Stage.JUST_FOUND, null, 1, 20).block().guideItems())
            .extracting(Dtos.PostSummary::name).containsExactly("a-title");
        assertThat(service.searchWithGuides("CMA", Stage.PRENATAL, null, 1, 20).block().guideItems()).isEmpty();
        assertThat(service.searchWithGuides("CMA", null, MaterialType.PAPER, 1, 20).block().guideItems()).isEmpty();
        assertThat(service.searchWithGuides(" ", null, null, 1, 20).block().guideItems()).isEmpty();
    }

    @Test
    void literaturePostsExposeCitationAndSupportKindFilter() {
        var client = mock(ReactiveExtensionClient.class);
        var postContent = mock(PostContentService.class);
        var service = service(client, postContent, new SearchIndex());

        var litByAnnotation = post("lit-1", true, Post.VisibleEnum.PUBLIC, false);
        litByAnnotation.getMetadata().setAnnotations(java.util.Map.of(
            "xiaojiaoya.run/article-kind", "LITERATURE",
            "xiaojiaoya.run/original-title", "Ponseti Method Long-Term Follow-Up",
            "xiaojiaoya.run/source-journal", "J Bone Joint Surg Am",
            "xiaojiaoya.run/published-year", "2024",
            "xiaojiaoya.run/evidence-type", "长期随访",
            "xiaojiaoya.run/doi", "10.2106/JBJS.24.00001",
            "xiaojiaoya.run/source-url", "https://doi.org/10.2106/JBJS.24.00001",
            "xiaojiaoya.run/verified-date", "2026-11-23"
        ));
        var litByTag = post("lit-2", true, Post.VisibleEnum.PUBLIC, false);
        litByTag.getSpec().setTags(List.of("tag-lit-id"));
        litByTag.getMetadata().setAnnotations(java.util.Map.of(
            "xiaojiaoya.run/source-url", "javascript:alert(1)"
        ));
        var normalGuide = post("guide-1", true, Post.VisibleEnum.PUBLIC, false);

        var tag = new Tag();
        var tagMeta = new Metadata();
        tagMeta.setName("tag-lit-id");
        tag.setMetadata(tagMeta);
        var tagSpec = new Tag.TagSpec();
        tagSpec.setDisplayName("文献译读");
        tagSpec.setSlug("literature-translation");
        tag.setSpec(tagSpec);

        when(client.list(eq(Tag.class), any(), any())).thenAnswer(call -> {
            Predicate<Tag> filter = call.getArgument(1);
            return Flux.just(tag).filter(filter);
        });
        when(client.list(eq(Post.class), any(), any())).thenReturn(Flux.just(litByAnnotation, litByTag, normalGuide));
        when(client.fetch(Post.class, "lit-1")).thenReturn(Mono.just(litByAnnotation));
        when(postContent.getReleaseContent("lit-1"))
            .thenReturn(Mono.just(ContentWrapper.builder().content("<p>论文译读正文</p>").build()));

        var onlyLit = service.listPosts(1, 20, "LITERATURE").block();
        assertThat(onlyLit.items()).extracting(Dtos.PostSummary::name).containsExactly("lit-1", "lit-2");
        assertThat(onlyLit.items().get(0).articleKind()).isEqualTo("LITERATURE");
        assertThat(onlyLit.items().get(0).citation().journal()).isEqualTo("J Bone Joint Surg Am");
        assertThat(onlyLit.items().get(1).articleKind()).isEqualTo("LITERATURE");
        assertThat(onlyLit.items().get(1).citation()).isNull();

        var onlyGuide = service.listPosts(1, 20, "GUIDE").block();
        assertThat(onlyGuide.items()).extracting(Dtos.PostSummary::name).containsExactly("guide-1");
        assertThat(onlyGuide.items().get(0).articleKind()).isEqualTo("GUIDE");

        var detail = service.getPost("lit-1").block();
        assertThat(detail.articleKind()).isEqualTo("LITERATURE");
        assertThat(detail.citation().doi()).isEqualTo("10.2106/JBJS.24.00001");
        assertThat(detail.citation().sourceUrl()).isEqualTo("https://doi.org/10.2106/JBJS.24.00001");
    }
}
