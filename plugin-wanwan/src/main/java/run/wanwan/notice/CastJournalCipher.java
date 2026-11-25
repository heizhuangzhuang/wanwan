package run.wanwan.notice;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

final class CastJournalCipher {
    private static final int NONCE_BYTES = 12;
    private static final int COMPRESS_THRESHOLD_BYTES = 512;
    private static final int MAX_DECOMPRESSED_BYTES = 8 * 1024 * 1024;
    private static final SecureRandom RANDOM = new SecureRandom();
    private final SecretKeySpec encryption;
    private final List<SecretKeySpec> fallbackEncryptions;
    private final byte[] ownership;

    CastJournalCipher(byte[] key) {
        this(key, List.of());
    }

    CastJournalCipher(byte[] key, List<byte[]> fallbackKeys) {
        encryption = new SecretKeySpec(mac(key, "cast-journal/encryption/v1"), "AES");
        ownership = mac(key, "cast-journal/owner/v1");
        List<SecretKeySpec> fallbacks = new ArrayList<>();
        if (fallbackKeys != null) {
            for (byte[] candidate : fallbackKeys) {
                if (candidate != null && candidate.length == 32) {
                    fallbacks.add(new SecretKeySpec(mac(candidate, "cast-journal/encryption/v1"), "AES"));
                }
            }
        }
        fallbackEncryptions = List.copyOf(fallbacks);
    }

    String name(String appId, String openId) {
        return "cast-" + HexFormat.of().formatHex(mac(ownership, appId + ":" + openId));
    }

    static String existingName(run.halo.app.extension.ExtensionClient client, CastJournalSettings settings,
                               CastJournalCipher current, String scope, String openId) {
        var currentName = current.name(scope, openId);
        var names = new java.util.LinkedHashSet<String>();
        names.add(currentName);
        for (byte[] key : settings.fallbackKeys) names.add(new CastJournalCipher(key).name(scope, openId));
        var found = names.stream().filter(name -> client.fetch(CastJournal.class, name).isPresent()).toList();
        if (found.size() > 1) throw FamilyTimer.conflict();
        return found.isEmpty() ? currentName : found.getFirst();
    }

    String encrypt(String owner, byte[] content) {
        byte[] nonce = new byte[NONCE_BYTES];
        RANDOM.nextBytes(nonce);
        byte[] ciphertext = crypt(Cipher.ENCRYPT_MODE, encryption, owner, nonce, content);
        return Base64.getEncoder().encodeToString(ByteBuffer.allocate(nonce.length + ciphertext.length)
            .put(nonce).put(ciphertext).array());
    }

    String encryptCompressed(String owner, byte[] content) {
        if (content.length < COMPRESS_THRESHOLD_BYTES) {
            return encrypt(owner, content);
        }
        byte[] compressed = gzip(content);
        return encrypt(owner, compressed.length < content.length ? compressed : content);
    }

    byte[] decrypt(String owner, String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("Cast journal payload is empty");
        }
        byte[] decoded;
        try {
            decoded = Base64.getDecoder().decode(value);
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("Cast journal cannot be processed");
        }
        if (decoded.length <= NONCE_BYTES) {
            throw new IllegalStateException("Cast journal cannot be processed");
        }
        var buffer = ByteBuffer.wrap(decoded);
        byte[] nonce = new byte[NONCE_BYTES];
        buffer.get(nonce);
        byte[] ciphertext = new byte[buffer.remaining()];
        buffer.get(ciphertext);
        byte[] plaintext = decryptWithKeys(owner, nonce, ciphertext);
        return maybeGunzip(plaintext);
    }

    private byte[] decryptWithKeys(String owner, byte[] nonce, byte[] ciphertext) {
        try {
            return crypt(Cipher.DECRYPT_MODE, encryption, owner, nonce, ciphertext);
        } catch (IllegalStateException primaryFailure) {
            for (SecretKeySpec fallback : fallbackEncryptions) {
                try {
                    return crypt(Cipher.DECRYPT_MODE, fallback, owner, nonce, ciphertext);
                } catch (IllegalStateException ignored) {
                    // Try next fallback key.
                }
            }
            throw primaryFailure;
        }
    }

    private byte[] crypt(int mode, SecretKeySpec keySpec, String owner, byte[] nonce, byte[] content) {
        try {
            var cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(mode, keySpec, new GCMParameterSpec(128, nonce));
            cipher.updateAAD(owner.getBytes(UTF_8));
            return cipher.doFinal(content);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Cast journal cannot be processed");
        }
    }

    private static byte[] gzip(byte[] content) {
        try (var out = new ByteArrayOutputStream(); var gz = new GZIPOutputStream(out)) {
            gz.write(content);
            gz.finish();
            return out.toByteArray();
        } catch (IOException e) {
            return content;
        }
    }

    private static byte[] maybeGunzip(byte[] content) {
        if (content.length < 2 || (content[0] & 0xff) != 0x1f || (content[1] & 0xff) != 0x8b) {
            return content;
        }
        try (var in = new GZIPInputStream(new ByteArrayInputStream(content));
             var out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096];
            int total = 0;
            int read;
            while ((read = in.read(buf)) != -1) {
                total += read;
                if (total > MAX_DECOMPRESSED_BYTES) {
                    throw new IllegalStateException("Cast journal payload exceeds size limit");
                }
                out.write(buf, 0, read);
            }
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Cast journal cannot be processed");
        }
    }

    private static byte[] mac(byte[] key, String material) {
        try {
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(material.getBytes(UTF_8));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Cast journal key is unavailable");
        }
    }
}
