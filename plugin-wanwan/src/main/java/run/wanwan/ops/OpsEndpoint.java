package run.wanwan.ops;

import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Sort;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.RouterFunctions;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import run.halo.app.core.extension.content.Category;
import run.halo.app.core.extension.content.Post;
import run.halo.app.core.extension.endpoint.CustomEndpoint;
import run.halo.app.extension.ExtensionOperator;
import run.halo.app.extension.GroupVersion;
import run.halo.app.extension.ListOptions;
import run.halo.app.extension.Metadata;
import run.halo.app.extension.ReactiveExtensionClient;
import run.wanwan.feedback.Feedback;
import run.wanwan.feedback.FeedbackService;
import run.wanwan.model.Enums.LinkStatus;
import run.wanwan.model.Enums.PublishState;
import run.wanwan.model.ResourceCard;
import run.wanwan.model.Stage;
import run.wanwan.model.Visibility;
import run.wanwan.search.SearchIndex;

@Component
class OpsEndpoint implements CustomEndpoint {
    private static final Duration VALID_FOR = Duration.ofHours(24);

    private final OpsProbes probes;
    private final ReactiveExtensionClient client;
    private final FeedbackService feedback;
    private final SearchIndex searchIndex;

    @Autowired
    OpsEndpoint(OpsProbes probes, ReactiveExtensionClient client, FeedbackService feedback,
                SearchIndex searchIndex) {
        this.probes = probes;
        this.client = client;
        this.feedback = feedback;
        this.searchIndex = searchIndex;
    }

    OpsEndpoint(OpsProbes probes, ReactiveExtensionClient client, FeedbackService feedback) {
        this(probes, client, feedback, new SearchIndex());
    }

    @Override
    public GroupVersion groupVersion() {
        return new GroupVersion("console.api.xiaojiaoya.run", "v1alpha1");
    }

    @Override
    public RouterFunction<ServerResponse> endpoint() {
        return RouterFunctions.route()
            .GET("ops-overview", this::overview)
            .PUT("ops-miniprogram-checks/{channel}", this::save)
            .GET("feedback", this::listFeedback)
            .PUT("feedback/{name}", this::updateFeedback)
            .DELETE("feedback/{name}", this::deleteFeedback)
            .build();
    }

    private Mono<ServerResponse> listFeedback(ServerRequest request) {
        int page = request.queryParam("page").filter(value -> value.matches("[0-9]{1,7}"))
            .map(Integer::parseInt).orElse(1);
        Feedback.Status status;
        try {
            status = request.queryParam("status").map(Feedback.Status::valueOf).orElse(null);
        } catch (IllegalArgumentException e) {
            return ServerResponse.badRequest().build();
        }
        return feedback.list(page, status)
            .flatMap(list -> ServerResponse.ok().cacheControl(CacheControl.noStore()).bodyValue(list));
    }

    private Mono<ServerResponse> updateFeedback(ServerRequest request) {
        return request.bodyToMono(FeedbackStatusInput.class)
            .flatMap(input -> feedback.updateStatus(request.pathVariable("name"), input.status()))
            .flatMap(row -> ServerResponse.ok().cacheControl(CacheControl.noStore()).bodyValue(row))
            .switchIfEmpty(ServerResponse.badRequest().build());
    }

    private Mono<ServerResponse> deleteFeedback(ServerRequest request) {
        return feedback.delete(request.pathVariable("name"))
            .then(ServerResponse.noContent().cacheControl(CacheControl.noStore()).build());
    }

    record FeedbackStatusInput(Feedback.Status status) {}

    private Mono<ServerResponse> overview(ServerRequest request) {
        return Mono.zip(probes.snapshot(), check("trial"), check("formal"), contentReport())
            .flatMap(data -> ServerResponse.ok().cacheControl(CacheControl.noStore())
                .bodyValue(new Overview(data.getT1(), List.of(data.getT2(), data.getT3()),
                    data.getT4().orElse(null))));
    }

    private Mono<Optional<ContentReport>> contentReport() {
        Mono<ContentCounts> cardsMono = safeFlux(
            client.listAll(ResourceCard.class, ListOptions.builder().build(), Sort.by("metadata.name")))
            .filter(card -> !ExtensionOperator.isDeleted(card) && card.getSpec() != null)
            .collect(ContentCounts::new, ContentCounts::add);
        Mono<GuideHealth> guidesMono = guideHealth()
            .onErrorReturn(new GuideHealth(0, 0, List.of()));
        Mono<Long> unreadFeedbackMono = Mono.defer(() -> {
            var res = feedback.list(1, Feedback.Status.NEW);
            return res == null ? Mono.just(0L) : res.map(page -> page.total());
        }).onErrorReturn(0L);
        return Mono.zip(cardsMono, guidesMono, unreadFeedbackMono)
            .map(tuple -> {
                var counts = tuple.getT1();
                var guides = tuple.getT2();
                return Optional.of(new ContentReport(
                    counts.publicCards,
                    counts.pendingReview,
                    counts.withdrawn,
                    counts.linksToCheck,
                    searchIndex.size(),
                    guides.publishedGuides(),
                    guides.uncategorizedGuides(),
                    guides.missingStageCategories(),
                    tuple.getT3()));
            })
            .onErrorReturn(Optional.empty());
    }

    private Mono<GuideHealth> guideHealth() {
        Flux<Category> categoriesFlux = safeFlux(client.list(
            Category.class,
            category -> !ExtensionOperator.isDeleted(category) && category.getSpec() != null,
            Comparator.comparing(category -> category.getMetadata().getName())));
        Flux<Post> postsFlux = safeFlux(client.list(
            Post.class,
            Visibility::isPublicPost,
            Comparator.comparing(post -> post.getMetadata().getName())));
        return Mono.zip(categoriesFlux.collectList(), postsFlux.collectList())
            .map(tuple -> {
                List<Category> categories = tuple.getT1();
                List<Post> posts = tuple.getT2();
                Set<String> stageCategoryNames = new HashSet<>();
                List<String> missing = Arrays.stream(Stage.values())
                    .filter(stage -> {
                        String slug = stage.name().toLowerCase(Locale.ROOT).replace('_', '-');
                        boolean matched = false;
                        for (Category category : categories) {
                            var spec = category.getSpec();
                            if (slug.equalsIgnoreCase(spec.getSlug())
                                || stage.getLabel().equals(spec.getDisplayName())) {
                                stageCategoryNames.add(category.getMetadata().getName());
                                matched = true;
                            }
                        }
                        return !matched;
                    })
                    .map(Stage::getLabel)
                    .toList();
                long uncategorized = posts.stream()
                    .filter(post -> post.getSpec().getCategories() == null
                        || post.getSpec().getCategories().stream().noneMatch(stageCategoryNames::contains))
                    .count();
                return new GuideHealth(posts.size(), uncategorized, missing);
            });
    }

    private static <T> Flux<T> safeFlux(Flux<T> flux) {
        return flux == null ? Flux.empty() : flux;
    }

    private Mono<CheckView> check(String channel) {
        return client.fetch(MiniProgramCheck.class, channel)
            .map(saved -> view(channel, saved, Instant.now()))
            .defaultIfEmpty(new CheckView(channel, CheckState.UNVERIFIED, null, null, null))
            .onErrorReturn(new CheckView(channel, CheckState.UNAVAILABLE, null, null, null));
    }

    private Mono<ServerResponse> save(ServerRequest request) {
        String channel = request.pathVariable("channel");
        if (!"trial".equals(channel) && !"formal".equals(channel)) {
            return ServerResponse.notFound().build();
        }
        return request.bodyToMono(CheckInput.class)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST)))
            .flatMap(input -> saveCheck(channel, input))
            .flatMap(saved -> ServerResponse.ok().cacheControl(CacheControl.noStore())
                .bodyValue(view(channel, saved, Instant.now())));
    }

    private Mono<MiniProgramCheck> saveCheck(String channel, CheckInput input) {
        if (input.version() == null || !input.version().matches("[A-Za-z0-9][A-Za-z0-9._+-]{0,31}")
            || input.outcome() == null) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Missing or invalid version or outcome"));
        }
        return client.fetch(MiniProgramCheck.class, channel)
            .flatMap(existing -> client.update(apply(existing, input)))
            .switchIfEmpty(Mono.defer(() -> {
                var created = new MiniProgramCheck();
                var metadata = new Metadata();
                metadata.setName(channel);
                created.setMetadata(metadata);
                return client.create(apply(created, input));
            }));
    }

    private static MiniProgramCheck apply(MiniProgramCheck check, CheckInput input) {
        check.setVersion(input.version());
        check.setOutcome(input.outcome());
        check.setCheckedAt(Instant.now());
        return check;
    }

    static CheckView view(String channel, MiniProgramCheck check, Instant now) {
        Instant checkedAt = check.getCheckedAt();
        if (checkedAt == null || check.getOutcome() == null || check.getVersion() == null) {
            return new CheckView(channel, CheckState.UNVERIFIED, null, null, null);
        }
        var state = checkedAt.plus(VALID_FOR).isAfter(now) ? CheckState.RECENT : CheckState.STALE;
        return new CheckView(channel, state, check.getVersion(), check.getOutcome(), checkedAt);
    }

    enum CheckState { UNVERIFIED, RECENT, STALE, UNAVAILABLE }

    record CheckInput(String version, MiniProgramCheck.Outcome outcome) {}
    record CheckView(String channel, CheckState state, String version, MiniProgramCheck.Outcome outcome,
                     Instant checkedAt) {}
    record Overview(OpsProbes.Snapshot probes, List<CheckView> miniProgramChecks, ContentReport contentReport) {}
    record ContentReport(long publicCards, long pendingReview, long withdrawn, long linksToCheck,
                         int searchIndexSize, long publishedGuides, long uncategorizedGuides,
                         List<String> missingStageCategories, long unreadFeedback) {}
    private record GuideHealth(long publishedGuides, long uncategorizedGuides, List<String> missingStageCategories) {}

    private static class ContentCounts {
        private long publicCards;
        private long pendingReview;
        private long withdrawn;
        private long linksToCheck;

        void add(ResourceCard card) {
            var spec = card.getSpec();
            if (Visibility.isListed(card)) {
                publicCards++;
                if (spec.getLinkStatus() != LinkStatus.OK) linksToCheck++;
            }
            if (spec.getState() == PublishState.PENDING_REVIEW) pendingReview++;
            if (spec.getState() == PublishState.WITHDRAWN
                || (Visibility.isPublic(card) && spec.getLinkStatus() == LinkStatus.SOURCE_RETRACTED)) {
                withdrawn++;
            }
        }
    }
}
