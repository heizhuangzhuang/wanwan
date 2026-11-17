package run.wanwan.api;

import java.util.Arrays;
import java.util.List;
import lombok.RequiredArgsConstructor;
import reactor.core.publisher.Mono;
import run.halo.app.theme.finders.Finder;
import run.wanwan.model.Enums.MaterialType;
import run.wanwan.model.Stage;

/**
 * Halo 主题 Finder（供 theme-wanwan 的 Thymeleaf 模板调用）。与公开 API 共用 PublicQueryService。
 */
@Finder("wanwanFinder")
@RequiredArgsConstructor
public class WanwanFinder {

    private final PublicQueryService queryService;

    public List<Dtos.StageView> stages() {
        return Arrays.stream(Stage.values()).map(Dtos.StageView::of).toList();
    }

    public Mono<Dtos.Page<Dtos.ResourceView>> listResources(String stage, String type, String tag,
                                                           int page, int size) {
        return queryService.listResources(parseEnum(stage, Stage.class),
            parseEnum(type, MaterialType.class), tag, page, size);
    }

    public Mono<Dtos.ResourceView> getResource(String name) {
        return queryService.getResource(name);
    }

    public Mono<Dtos.Page<Dtos.TopicSummary>> listTopics(int page, int size) {
        return queryService.listTopics(page, size);
    }

    public Mono<Dtos.TopicView> getTopic(String name) {
        return queryService.getTopic(name);
    }

    public Mono<Dtos.Page<Dtos.ResourceView>> search(String keyword, String stage, String type,
                                                     int page, int size) {
        return queryService.search(keyword, parseEnum(stage, Stage.class),
            parseEnum(type, MaterialType.class), page, size);
    }

    private static <E extends Enum<E>> E parseEnum(String value, Class<E> type) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Enum.valueOf(type, value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
