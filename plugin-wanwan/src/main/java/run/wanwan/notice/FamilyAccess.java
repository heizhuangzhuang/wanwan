package run.wanwan.notice;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import org.springframework.core.env.Environment;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import run.halo.app.core.extension.User;
import run.halo.app.extension.ExtensionClient;
import run.halo.app.extension.ExtensionOperator;
import run.halo.app.extension.Metadata;
import tools.jackson.databind.ObjectMapper;

@Component
class FamilyAccess {
    static final String FAMILY_USER = "xiaojiaoya.run/family";
    static final String LOGIN_ANNOTATION = "xiaojiaoya.run/last-login-";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Duration PAIR_LIFETIME = Duration.ofMinutes(3);
    private static final Duration SESSION_LIFETIME = Duration.ofDays(7);
    private final ExtensionClient client;
    private final CastJournalSettings settings;
    private final WechatNoticeClient wechat;
    private final CastJournalCipher cipher;
    private final ObjectMapper json = new ObjectMapper();
    private final String qrEnvironment;
    final boolean enabled;

    FamilyAccess(ExtensionClient client, CastJournalSettings settings, WechatNoticeClient wechat, Environment env) {
        this.client = client;
        this.settings = settings;
        this.wechat = wechat;
        enabled = settings.enabled && env.getProperty("XIAOJIAOYA_FAMILY_ENABLED", Boolean.class, false);
        cipher = enabled ? new CastJournalCipher(settings.key, settings.fallbackKeys) : null;
        qrEnvironment = env.getProperty("XIAOJIAOYA_FAMILY_QR_ENV", "release");
    }

    Login mini(String code) {
        if (code == null || !code.matches("[A-Za-z0-9_-]{8,128}")) throw fail(HttpStatus.BAD_REQUEST);
        String openId;
        try {
            openId = wechat.openId(settings.appId, settings.secret, code);
        } catch (WechatNoticeClient.InvalidCode e) {
            throw fail(HttpStatus.UNAUTHORIZED);
        } catch (WechatNoticeClient.Unavailable e) {
            throw fail(HttpStatus.BAD_GATEWAY);
        }
        String account = account(openId);
        return login(new Session(account, openId, "mini", Instant.now().plus(SESSION_LIFETIME)));
    }

    void verifyLegacy(String openId) {
        if (!enabled) return;
        var names = knownAccounts(openId);
        if (names.size() > 1) throw fail(HttpStatus.CONFLICT);
        if (!names.isEmpty()) requireUser(names.getFirst());
    }

    private java.util.List<String> knownAccounts(String openId) {
        var names = new ArrayList<String>();
        names.add(accountName(cipher, openId));
        for (byte[] key : settings.fallbackKeys) {
            String name = accountName(new CastJournalCipher(key), openId);
            if (!names.contains(name)) names.add(name);
        }
        return names.stream().filter(name -> client.fetch(FamilyAccessRecord.class, name).isPresent()).toList();
    }

    private String account(String openId) {
        var found = knownAccounts(openId);
        if (found.size() > 1) throw fail(HttpStatus.CONFLICT);
        String name = found.isEmpty() ? accountName(cipher, openId) : found.getFirst();
        var state = client.fetch(FamilyAccessRecord.class, name).orElse(null);
        if (state == null) {
            try {
                client.create(row(name, Instant.MAX, new Account(false)));
            } catch (DuplicateKeyException | OptimisticLockingFailureException ignored) {
                // A concurrent first login reserved the same account.
            }
            state = client.fetch(FamilyAccessRecord.class, name).orElseThrow(FamilyTimer::conflict);
        }
        if (read(state, Account.class).ready()) return requireUser(name);
        if (client.fetch(User.class, name).isEmpty()) {
            var user = new User();
            user.setMetadata(metadata(name));
            user.getMetadata().setAnnotations(java.util.Map.of(FAMILY_USER, "true"));
            var spec = new User.UserSpec();
            spec.setDisplayName("小脚丫家长 " + name.substring(7, 15));
            spec.setRegisteredAt(Instant.now());
            spec.setDisabled(false);
            user.setSpec(spec);
            try {
                client.create(user);
            } catch (DuplicateKeyException | OptimisticLockingFailureException ignored) {
                // Same deterministic Halo username, with no local credential or role binding.
            }
        }
        requireUser(name);
        try {
            update(state, new Account(true));
        } catch (OptimisticLockingFailureException ignored) {
            // Already finished by a concurrent request.
        }
        return name;
    }

    private String accountName(CastJournalCipher key, String openId) {
        return "family-" + key.name("family:" + settings.appId, openId).substring(5, 45);
    }

    private String requireUser(String name) {
        var user = client.fetch(User.class, name)
            .filter(value -> !ExtensionOperator.isDeleted(value)).orElseThrow(() -> fail(HttpStatus.UNAUTHORIZED));
        if (user.getSpec() == null || Boolean.TRUE.equals(user.getSpec().getDisabled())
            || user.getMetadata().getAnnotations() == null
            || !"true".equals(user.getMetadata().getAnnotations().get(FAMILY_USER))) {
            throw fail(HttpStatus.UNAUTHORIZED);
        }
        return name;
    }

    Pairing createPair(String browserSecret) {
        validateSecret(browserSecret);
        String code = random(6).toUpperCase(java.util.Locale.ROOT);
        var expires = Instant.now().plus(PAIR_LIFETIME);
        client.create(row("pair-" + code.toLowerCase(java.util.Locale.ROOT), expires,
            new Pair(hash(browserSecret), null, false)));
        String image = null;
        try {
            image = wechat.familyQr(settings.appId, settings.secret, qrEnvironment, code);
        } catch (WechatNoticeClient.Unavailable ignored) {
            // The same challenge works via manual input when the code service is unavailable.
        }
        return new Pairing(code, expires.toString(), image);
    }

    void approve(String code, Session session) {
        if (!"mini".equals(session.channel())) throw fail(HttpStatus.FORBIDDEN);
        var state = pair(code);
        var pair = read(state, Pair.class);
        if (pair.user() != null || pair.redeemed()) throw FamilyTimer.conflict();
        change(state, new Pair(pair.secret(), session, false));
    }

    Login exchange(String code, String browserSecret) {
        return exchange(code, browserSecret, false);
    }

    Login exchange(String code, String browserSecret, boolean cancel) {
        validateSecret(browserSecret);
        var state = pair(code);
        var pair = read(state, Pair.class);
        if (!MessageDigest.isEqual(pair.secret().getBytes(java.nio.charset.StandardCharsets.US_ASCII),
            hash(browserSecret).getBytes(java.nio.charset.StandardCharsets.US_ASCII))) {
            throw fail(HttpStatus.NOT_FOUND);
        }
        if (pair.redeemed()) throw FamilyTimer.conflict();
        if (cancel) {
            change(state, new Pair(pair.secret(), null, true));
            return null;
        }
        if (pair.user() == null) return null;
        requireUser(pair.user().account());
        change(state, new Pair(pair.secret(), null, true));
        return login(new Session(pair.user().account(), pair.user().openId(), "web", Instant.now().plus(SESSION_LIFETIME)));
    }

    Session session(String token) {
        validateSecret(token);
        var state = live("session-" + hash(token), HttpStatus.UNAUTHORIZED);
        var session = read(state, Session.class);
        requireUser(session.account());
        return session;
    }

    void logout(String token) {
        var state = live("session-" + hash(token), HttpStatus.UNAUTHORIZED);
        client.delete(state);
    }

    private Login login(Session session) {
        String token = random(32);
        client.create(row("session-" + hash(token), session.expires(), session));
        recordLogin(session);
        return new Login(token, session.account(), session.channel(), session.expires().toString());
    }

    private void recordLogin(Session session) {
        var field = LOGIN_ANNOTATION + session.channel();
        String signedIn = session.expires().minus(SESSION_LIFETIME).toString();
        for (int attempt = 0; attempt < 3; attempt++) {
            var user = client.fetch(User.class, session.account()).orElse(null);
            if (user == null || ExtensionOperator.isDeleted(user)) return;
            var annotations = new java.util.HashMap<>(user.getMetadata().getAnnotations());
            if (annotations.containsKey(field) && Instant.parse(annotations.get(field)).compareTo(Instant.parse(signedIn)) >= 0) return;
            annotations.put(field, signedIn);
            user.getMetadata().setAnnotations(annotations);
            try {
                client.update(user);
                return;
            } catch (OptimisticLockingFailureException e) {
                // Never replace a concurrent account status or role change.
            }
        }
    }

    private FamilyAccessRecord pair(String code) {
        if (code == null || !code.matches("[A-Fa-f0-9]{12}")) throw fail(HttpStatus.BAD_REQUEST);
        return live("pair-" + code.toLowerCase(java.util.Locale.ROOT), HttpStatus.NOT_FOUND);
    }

    private FamilyAccessRecord live(String name, HttpStatus unavailable) {
        return client.fetch(FamilyAccessRecord.class, name)
            .filter(value -> !ExtensionOperator.isDeleted(value) && value.getExpiresAt().isAfter(Instant.now()))
            .orElseThrow(() -> fail(unavailable));
    }

    private FamilyAccessRecord row(String name, Instant expires, Object value) {
        var row = new FamilyAccessRecord();
        row.setMetadata(metadata(name));
        row.setExpiresAt(expires.equals(Instant.MAX) ? null : expires);
        row.setPayload(cipher.encrypt(name, json.writeValueAsBytes(value)));
        return row;
    }

    private void change(FamilyAccessRecord state, Pair pair) {
        try {
            update(state, pair);
        } catch (OptimisticLockingFailureException e) {
            throw FamilyTimer.conflict();
        }
    }

    private void update(FamilyAccessRecord row, Object value) {
        row.setPayload(cipher.encrypt(row.getMetadata().getName(), json.writeValueAsBytes(value)));
        client.update(row);
    }

    private <T> T read(FamilyAccessRecord row, Class<T> type) {
        return json.readValue(cipher.decrypt(row.getMetadata().getName(), row.getPayload()), type);
    }

    private static Metadata metadata(String name) {
        var metadata = new Metadata();
        metadata.setName(name);
        return metadata;
    }

    private static void validateSecret(String secret) {
        if (secret == null || !secret.matches("[a-f0-9]{64}")) throw fail(HttpStatus.UNAUTHORIZED);
    }

    private static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(java.nio.charset.StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String random(int size) {
        var bytes = new byte[size];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    static ResponseStatusException fail(HttpStatus code) {
        return new ResponseStatusException(code);
    }

    record Account(boolean ready) {}
    record Pair(String secret, Session user, boolean redeemed) {}
    record Session(String account, String openId, String channel, Instant expires) {}
    record Login(String token, String account, String channel, String expiresAt) {}
    record Pairing(String code, String expiresAt, String image) {}
}
