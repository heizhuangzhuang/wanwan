package run.wanwan.notice;

import java.time.Instant;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;
import run.halo.app.extension.AbstractExtension;
import run.halo.app.extension.GVK;

@Data
@EqualsAndHashCode(callSuper = true)
@GVK(group = "wanwan.run", version = "v1alpha1", kind = "FamilyAccessRecord",
    plural = "familyaccessrecords", singular = "familyaccessrecord")
public class FamilyAccessRecord extends AbstractExtension {
    @ToString.Exclude
    private String payload;
    private Instant expiresAt;
}
