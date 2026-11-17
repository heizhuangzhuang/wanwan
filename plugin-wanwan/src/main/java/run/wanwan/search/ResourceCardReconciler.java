package run.wanwan.search;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import run.halo.app.extension.ExtensionClient;
import run.halo.app.extension.controller.Controller;
import run.halo.app.extension.controller.ControllerBuilder;
import run.halo.app.extension.controller.Reconciler;
import run.wanwan.model.ResourceCard;

/**
 * 监听资料卡变化并同步搜索索引。启动时全量同步，删除或撤回后从索引移除。
 */
@Component
@RequiredArgsConstructor
public class ResourceCardReconciler implements Reconciler<Reconciler.Request> {

    private final ExtensionClient client;
    private final SearchIndex searchIndex;

    @Override
    public Result reconcile(Request request) {
        client.fetch(ResourceCard.class, request.name())
            .ifPresentOrElse(searchIndex::upsert, () -> searchIndex.remove(request.name()));
        return Result.doNotRetry();
    }

    @Override
    public Controller setupWith(ControllerBuilder builder) {
        return builder
            .extension(new ResourceCard())
            .syncAllOnStart(true)
            .build();
    }
}
