package run.wanwan.model;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;
import lombok.EqualsAndHashCode;
import run.halo.app.extension.AbstractExtension;
import run.halo.app.extension.GVK;
import run.wanwan.model.Enums.PublishState;

/**
 * 专题：运营者维护的导读文字与有序资料卡列表。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@GVK(group = "wanwan.run", version = "v1alpha1", kind = "Topic",
    plural = "topics", singular = "topic")
public class Topic extends AbstractExtension {

    private Spec spec = new Spec();

    @Data
    public static class Spec {
        private String title;
        private String intro;
        /** 资料卡 metadata.name 的有序列表。 */
        private List<String> resourceNames = new ArrayList<>();
        private PublishState state = PublishState.DRAFT;
        private Integer priority = 1000;
    }
}
