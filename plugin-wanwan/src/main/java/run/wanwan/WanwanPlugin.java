package run.wanwan;

import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import run.halo.app.extension.Extension;
import run.halo.app.extension.GroupVersionKind;
import run.halo.app.extension.SchemeManager;
import run.halo.app.extension.index.IndexSpecs;
import run.halo.app.plugin.BasePlugin;
import run.halo.app.plugin.PluginContext;
import run.wanwan.api.PublicQueryService;
import run.wanwan.feedback.Feedback;
import run.wanwan.feedback.FeedbackService;
import run.wanwan.model.ResourceCard;
import run.wanwan.model.Topic;
import run.wanwan.model.Visibility;
import run.wanwan.notice.CastJournal;
import run.wanwan.notice.FamilyAccessRecord;
import run.wanwan.notice.NoticePublication;
import run.wanwan.notice.NoticeService;
import run.wanwan.notice.NoticeSubscription;
import run.wanwan.ops.MiniProgramCheck;

/**
 * 弯弯插件入口：注册资料卡与专题模型及其查询索引。
 */
@Component
public class WanwanPlugin extends BasePlugin {

    private final SchemeManager schemeManager;

    public WanwanPlugin(PluginContext pluginContext, SchemeManager schemeManager) {
        super(pluginContext);
        this.schemeManager = schemeManager;
    }

    @Override
    public void start() {
        schemeManager.register(ResourceCard.class, specs -> {
            specs.add(IndexSpecs.<ResourceCard, String>single(PublicQueryService.IDX_LISTED, String.class)
                .indexFunc(card -> String.valueOf(Visibility.isListed(card))));
            specs.add(IndexSpecs.<ResourceCard, String>multi(PublicQueryService.IDX_STAGES, String.class)
                .indexFunc(card -> card.getSpec().getStages() == null ? Set.of()
                    : card.getSpec().getStages().stream().map(Enum::name)
                        .collect(Collectors.toSet())));
            specs.add(IndexSpecs.<ResourceCard, String>single(PublicQueryService.IDX_TYPE, String.class)
                .indexFunc(card -> card.getSpec().getMaterialType() == null ? null
                    : card.getSpec().getMaterialType().name()));
            specs.add(IndexSpecs.<ResourceCard, String>multi(PublicQueryService.IDX_TAGS, String.class)
                .indexFunc(card -> card.getSpec().getTags() == null ? Set.of()
                    : Set.copyOf(card.getSpec().getTags())));
            specs.add(IndexSpecs.<ResourceCard, Integer>single(PublicQueryService.IDX_PRIORITY, Integer.class)
                .indexFunc(card -> card.getSpec().getPriority() == null ? 1000
                    : card.getSpec().getPriority()));
        });
        schemeManager.register(NoticePublication.class);
        schemeManager.register(CastJournal.class);
        schemeManager.register(FamilyAccessRecord.class);
        schemeManager.register(MiniProgramCheck.class);
        schemeManager.register(Feedback.class, specs ->
            specs.add(IndexSpecs.<Feedback, String>single(FeedbackService.STATUS_INDEX, String.class)
                .indexFunc(row -> row.getStatus() == null ? null : row.getStatus().name())));
        schemeManager.register(NoticeSubscription.class, specs ->
            specs.add(IndexSpecs.<NoticeSubscription, String>single(NoticeService.PENDING_SCOPE, String.class)
                .indexFunc(grant -> grant.getOpenId() == null ? null : grant.getScope())));
        schemeManager.register(Topic.class, specs -> {
            specs.add(IndexSpecs.<Topic, String>single(PublicQueryService.IDX_TOPIC_PUBLIC, String.class)
                .indexFunc(topic -> String.valueOf(Visibility.isPublic(topic))));
            specs.add(IndexSpecs.<Topic, Integer>single(PublicQueryService.IDX_PRIORITY, Integer.class)
                .indexFunc(topic -> topic.getSpec().getPriority() == null ? 1000
                    : topic.getSpec().getPriority()));
        });
    }

    @Override
    public void stop() {
        unregister(ResourceCard.class);
        unregister(Topic.class);
        unregister(NoticePublication.class);
        unregister(CastJournal.class);
        unregister(FamilyAccessRecord.class);
        unregister(NoticeSubscription.class);
        unregister(MiniProgramCheck.class);
        unregister(Feedback.class);
    }

    private void unregister(Class<? extends Extension> type) {
        schemeManager.fetch(GroupVersionKind.fromExtension(type)).ifPresent(schemeManager::unregister);
    }
}
