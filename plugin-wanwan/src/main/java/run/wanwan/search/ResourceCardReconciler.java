package run.wanwan.search;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import run.halo.app.extension.ExtensionClient;
import run.halo.app.extension.controller.Controller;
import run.halo.app.extension.controller.ControllerBuilder;
import run.halo.app.extension.controller.Reconciler;
import run.wanwan.model.ResourceCard;
import run.wanwan.notice.NoticeService;

/**
 * 监听资料卡变化并同步搜索索引。启动时全量同步，删除或撤回后从索引移除。
 */
@Component
@RequiredArgsConstructor
public class ResourceCardReconciler implements Reconciler<Reconciler.Request> {

    private final ExtensionClient client;
    private final SearchIndex searchIndex;
    private final NoticeService notices;

    @Override
    public Result reconcile(Request request) {
        client.fetch(ResourceCard.class, request.name())
            .ifPresentOrElse(card -> {
                searchIndex.upsert(card);
                notices.observeResource(card);
            }, () -> searchIndex.remove(request.name()));
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
