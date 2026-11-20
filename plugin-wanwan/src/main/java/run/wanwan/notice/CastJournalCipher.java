package run.wanwan.notice;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

final class CastJournalCipher {
    private static final int NONCE_BYTES = 12;
    private static final SecureRandom RANDOM = new SecureRandom();
    private final SecretKeySpec encryption;
    private final byte[] ownership;

    CastJournalCipher(byte[] key) {
        encryption = new SecretKeySpec(mac(key, "cast-journal/encryption/v1"), "AES");
        ownership = mac(key, "cast-journal/owner/v1");
    }

    String name(String appId, String openId) {
        return "cast-" + HexFormat.of().formatHex(mac(ownership, appId + ":" + openId));
    }

    String encrypt(String owner, byte[] content) {
        byte[] nonce = new byte[NONCE_BYTES];
        RANDOM.nextBytes(nonce);
        byte[] ciphertext = crypt(Cipher.ENCRYPT_MODE, owner, nonce, content);
        return Base64.getEncoder().encodeToString(ByteBuffer.allocate(nonce.length + ciphertext.length)
            .put(nonce).put(ciphertext).array());
    }

    byte[] decrypt(String owner, String value) {
        var buffer = ByteBuffer.wrap(Base64.getDecoder().decode(value));
        byte[] nonce = new byte[NONCE_BYTES];
        buffer.get(nonce);
        byte[] ciphertext = new byte[buffer.remaining()];
        buffer.get(ciphertext);
        return crypt(Cipher.DECRYPT_MODE, owner, nonce, ciphertext);
    }

    private byte[] crypt(int mode, String owner, byte[] nonce, byte[] content) {
        try {
            var cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(mode, encryption, new GCMParameterSpec(128, nonce));
            cipher.updateAAD(owner.getBytes(UTF_8));
            return cipher.doFinal(content);
        } catch (GeneralSecurityException e) {
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
