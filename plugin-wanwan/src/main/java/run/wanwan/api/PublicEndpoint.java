package run.wanwan.api;

import java.util.Arrays;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.RouterFunctions;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import reactor.core.publisher.Mono;
import run.halo.app.core.extension.endpoint.CustomEndpoint;
import run.halo.app.extension.GroupVersion;
import run.wanwan.model.Enums.MaterialType;
import run.wanwan.model.Stage;
import run.wanwan.search.SearchIndex;

/**
 * 匿名公开接口：/apis/api.wanwan.run/v1alpha1/**（ADR-004）。
 */
@Component
@RequiredArgsConstructor
public class PublicEndpoint implements CustomEndpoint {

    private final PublicQueryService queryService;

    @Override
    public RouterFunction<ServerResponse> endpoint() {
        return RouterFunctions.route()
            .GET("stages", req -> ServerResponse.ok()
                .bodyValue(Arrays.stream(Stage.values()).map(Dtos.StageView::of).toList()))
            .GET("resources", this::listResources)
            .GET("resources/{name}", req -> okOrNotFound(
                queryService.getResource(req.pathVariable("name"))))
            .GET("topics", req -> ServerResponse.ok()
                .body(queryService.listTopics(intParam(req, "page", 1), intParam(req, "size", 20)),
                    Dtos.Page.class))
            .GET("topics/{name}", req -> okOrNotFound(
                queryService.getTopic(req.pathVariable("name"))))
            .GET("posts", req -> ServerResponse.ok()
                .body(queryService.listPosts(intParam(req, "page", 1), intParam(req, "size", 20)),
                    Dtos.Page.class))
            .GET("posts/{name}", req -> okOrNotFound(
                queryService.getPost(req.pathVariable("name"))))
            .GET("search", this::search)
            .build();
    }

    @Override
    public GroupVersion groupVersion() {
        return GroupVersion.parseAPIVersion("api.wanwan.run/v1alpha1");
    }

    private Mono<ServerResponse> listResources(ServerRequest req) {
        return ServerResponse.ok().body(queryService.listResources(
            enumParam(req, "stage", Stage.class),
            enumParam(req, "type", MaterialType.class),
            req.queryParam("tag").orElse(null),
            intParam(req, "page", 1),
            intParam(req, "size", 20)), Dtos.Page.class);
    }

    private Mono<ServerResponse> search(ServerRequest req) {
        String keyword = req.queryParam("keyword").orElse("");
        if (keyword.length() > SearchIndex.MAX_KEYWORD_LENGTH) {
            return ServerResponse.badRequest().bodyValue("keyword too long");
        }
        return ServerResponse.ok().body(queryService.search(keyword,
            enumParam(req, "stage", Stage.class),
            enumParam(req, "type", MaterialType.class),
            intParam(req, "page", 1),
            intParam(req, "size", 20)), Dtos.Page.class);
    }

    private static <T> Mono<ServerResponse> okOrNotFound(Mono<T> body) {
        return body.flatMap(b -> ServerResponse.ok().bodyValue(b))
            .switchIfEmpty(ServerResponse.status(HttpStatus.NOT_FOUND).build());
    }

    static int intParam(ServerRequest req, String key, int defaultValue) {
        return req.queryParam(key).flatMap(v -> {
            try {
                return Optional.of(Integer.parseInt(v));
            } catch (NumberFormatException e) {
                return Optional.empty();
            }
        }).orElse(defaultValue);
    }

    /** 非法枚举值按"不筛选"处理，不抛 500。 */
    static <E extends Enum<E>> E enumParam(ServerRequest req, String key, Class<E> type) {
        return req.queryParam(key).flatMap(v -> {
            try {
                return Optional.of(Enum.valueOf(type, v.trim().toUpperCase()));
            } catch (IllegalArgumentException e) {
                return Optional.empty();
            }
        }).orElse(null);
    }
}
