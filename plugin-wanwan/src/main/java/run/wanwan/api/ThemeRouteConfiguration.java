package run.wanwan.api;

import static org.springframework.web.reactive.function.server.RequestPredicates.GET;
import static org.springframework.web.reactive.function.server.RouterFunctions.route;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import reactor.core.publisher.Mono;
import run.halo.app.theme.TemplateNameResolver;
import run.wanwan.model.Enums.MaterialType;
import run.wanwan.model.Stage;

/**
 * Web 主题页面路由。所有资料卡与专题访问均经 PublicQueryService 过滤，撤回或未发布返回 404。
 */
@Configuration
@RequiredArgsConstructor
public class ThemeRouteConfiguration {

    private final PublicQueryService queryService;
    private final TemplateNameResolver templateNameResolver;

    @Bean
    public RouterFunction<ServerResponse> wanwanThemeRoutes() {
        return route(GET("/stages"), this::stages)
            .andRoute(GET("/stages/{stage}"), this::stageDetail)
            .andRoute(GET("/resources"), this::resources)
            .andRoute(GET("/resources/{name}"), this::resourceDetail)
            .andRoute(GET("/topics"), this::topics)
            .andRoute(GET("/topics/{name}"), this::topicDetail)
            .andRoute(GET("/search"), this::search)
            .andRoute(GET("/about"), req -> render(req, "about", Map.of("title", "关于与规则")));
    }

    private Mono<ServerResponse> stages(ServerRequest req) {
        var stages = Arrays.stream(Stage.values()).map(Dtos.StageView::of).toList();
        return render(req, "stages", Map.of("stages", stages, "title", "按阶段浏览"));
    }

    private Mono<ServerResponse> stageDetail(ServerRequest req) {
        Stage stage;
        try {
            stage = Stage.valueOf(req.pathVariable("stage").trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return notFound();
        }
        MaterialType type = PublicEndpoint.enumParam(req, "type", MaterialType.class);
        String tag = req.queryParam("tag").orElse(null);
        int page = PublicEndpoint.intParam(req, "page", 1);
        return queryService.listResources(stage, type, tag, page, 20)
            .flatMap(result -> {
                Map<String, Object> model = new HashMap<>();
                model.put("stage", Dtos.StageView.of(stage));
                model.put("resources", result);
                model.put("selectedType", type == null ? "" : type.name());
                model.put("selectedTag", tag == null ? "" : tag);
                model.put("title", stage.getLabel());
                return render(req, "stage", model);
            });
    }

    private Mono<ServerResponse> resources(ServerRequest req) {
        Stage stage = PublicEndpoint.enumParam(req, "stage", Stage.class);
        MaterialType type = PublicEndpoint.enumParam(req, "type", MaterialType.class);
        String tag = req.queryParam("tag").orElse(null);
        int page = PublicEndpoint.intParam(req, "page", 1);
        return queryService.listResources(stage, type, tag, page, 20)
            .flatMap(result -> {
                Map<String, Object> model = new HashMap<>();
                model.put("resources", result);
                model.put("selectedStage", stage == null ? "" : stage.name());
                model.put("selectedType", type == null ? "" : type.name());
                model.put("selectedTag", tag == null ? "" : tag);
                model.put("title", "资料库");
                return render(req, "resources", model);
            });
    }

    private Mono<ServerResponse> resourceDetail(ServerRequest req) {
        String name = req.pathVariable("name");
        return queryService.getResource(name)
            .flatMap(view -> render(req, "resource", Map.of("resource", view, "title", view.title())))
            .switchIfEmpty(notFound());
    }

    private Mono<ServerResponse> topics(ServerRequest req) {
        int page = PublicEndpoint.intParam(req, "page", 1);
        return queryService.listTopics(page, 20)
            .flatMap(result -> render(req, "topics", Map.of("topics", result, "title", "精选专题")));
    }

    private Mono<ServerResponse> topicDetail(ServerRequest req) {
        String name = req.pathVariable("name");
        return queryService.getTopic(name)
            .flatMap(view -> render(req, "topic", Map.of("topic", view, "title", view.title())))
            .switchIfEmpty(notFound());
    }

    private Mono<ServerResponse> search(ServerRequest req) {
        String keyword = req.queryParam("keyword").orElse("");
        Stage stage = PublicEndpoint.enumParam(req, "stage", Stage.class);
        MaterialType type = PublicEndpoint.enumParam(req, "type", MaterialType.class);
        int page = PublicEndpoint.intParam(req, "page", 1);
        boolean tooLong = keyword.length() > run.wanwan.search.SearchIndex.MAX_KEYWORD_LENGTH;
        Mono<Dtos.Page<Dtos.ResourceView>> query = tooLong
            ? Mono.just(new Dtos.Page<>(1, 20, 0, java.util.List.of()))
            : queryService.search(keyword, stage, type, page, 20);
        return query.flatMap(result -> {
            Map<String, Object> model = new HashMap<>();
            model.put("keyword", keyword);
            model.put("tooLong", tooLong);
            model.put("results", result);
            model.put("selectedStage", stage == null ? "" : stage.name());
            model.put("selectedType", type == null ? "" : type.name());
            model.put("title", "站内搜索");
            return render(req, "search", model);
        });
    }

    private Mono<ServerResponse> render(ServerRequest req, String template, Map<String, Object> model) {
        return templateNameResolver.resolveTemplateNameOrDefault(req.exchange(), template)
            .flatMap(resolved -> ServerResponse.ok().render(resolved, model));
    }

    private static Mono<ServerResponse> notFound() {
        return ServerResponse.status(HttpStatus.NOT_FOUND).build();
    }
}
