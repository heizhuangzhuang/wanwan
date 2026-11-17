package run.wanwan.api;

import java.net.URI;
import java.util.Locale;
import java.util.regex.Pattern;
import org.apache.commons.lang3.StringUtils;
import run.wanwan.model.Enums.EntryType;
import run.wanwan.model.Enums.LinkStatus;
import run.wanwan.model.ResourceCard;

/**
 * 根据编辑声明与校验结果决定最终对外的原文入口（ADR-004）。任何校验不通过都降级为 CITATION_ONLY。
 */
public final class EntryResolver {

    private static final Pattern APP_ID = Pattern.compile("^wx[0-9a-f]{16}$");

    private EntryResolver() {
    }

    public static Dtos.Entry resolve(ResourceCard.Spec spec) {
        if (spec == null) {
            return Dtos.Entry.citationOnly();
        }
        // 只有人工核对为正常的链接才开放入口
        if (spec.getLinkStatus() != LinkStatus.OK || spec.getEntryType() == null) {
            return Dtos.Entry.citationOnly();
        }
        return switch (spec.getEntryType()) {
            case WEB -> isSafeHttpUrl(spec.getUrl())
                ? new Dtos.Entry(EntryType.WEB, spec.getUrl(), null, null)
                : Dtos.Entry.citationOnly();
            case MP_ARTICLE -> isWechatArticle(spec.getUrl())
                ? new Dtos.Entry(EntryType.MP_ARTICLE, spec.getUrl(), null, null)
                : Dtos.Entry.citationOnly();
            case MINIPROGRAM -> isValidMiniProgram(spec.getMiniProgramAppId(), spec.getMiniProgramPath())
                ? new Dtos.Entry(EntryType.MINIPROGRAM, null, spec.getMiniProgramAppId(),
                    spec.getMiniProgramPath())
                : Dtos.Entry.citationOnly();
            case CITATION_ONLY -> Dtos.Entry.citationOnly();
        };
    }

    /** 只允许 http/https 且有主机名；拒绝 javascript:、data:、file: 等协议与内嵌凭据。 */
    public static boolean isSafeHttpUrl(String url) {
        if (StringUtils.isBlank(url) || url.length() > 2048) {
            return false;
        }
        try {
            URI uri = new URI(url.trim());
            String scheme = uri.getScheme();
            if (scheme == null) {
                return false;
            }
            scheme = scheme.toLowerCase(Locale.ROOT);
            return (scheme.equals("http") || scheme.equals("https"))
                && StringUtils.isNotBlank(uri.getHost())
                && uri.getUserInfo() == null;
        } catch (Exception e) {
            return false;
        }
    }

    static boolean isWechatArticle(String url) {
        if (!isSafeHttpUrl(url)) {
            return false;
        }
        String host = URI.create(url.trim()).getHost().toLowerCase(Locale.ROOT);
        return host.equals("mp.weixin.qq.com");
    }

    static boolean isValidMiniProgram(String appId, String path) {
        return appId != null && APP_ID.matcher(appId).matches()
            && (path == null || (path.length() <= 512 && !path.contains("://")));
    }
}
