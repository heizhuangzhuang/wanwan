package run.wanwan.ops;

import java.time.Instant;
import lombok.Data;
import lombok.EqualsAndHashCode;
import run.halo.app.extension.AbstractExtension;
import run.halo.app.extension.GVK;

@Data
@EqualsAndHashCode(callSuper = true)
@GVK(group = "wanwan.run", version = "v1alpha1", kind = "MiniProgramCheck",
    plural = "miniprogramchecks", singular = "miniprogramcheck")
public class MiniProgramCheck extends AbstractExtension {
    enum Outcome { PASS, FAIL }

    private String version;
    private Outcome outcome;
    private Instant checkedAt;
}
