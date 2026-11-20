package run.wanwan.notice;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import run.halo.app.core.extension.content.Post;
import run.halo.app.extension.ExtensionClient;
import run.halo.app.extension.controller.Controller;
import run.halo.app.extension.controller.ControllerBuilder;
import run.halo.app.extension.controller.Reconciler;

@Component
@RequiredArgsConstructor
class GuideNoticeReconciler implements Reconciler<Reconciler.Request> {
    private final ExtensionClient client;
    private final NoticeService notices;

    @Override
    public Result reconcile(Request request) {
        client.fetch(Post.class, request.name()).ifPresent(notices::observeGuide);
        return Result.doNotRetry();
    }

    @Override
    public Controller setupWith(ControllerBuilder builder) {
        return builder.extension(new Post()).syncAllOnStart(true).build();
    }
}
