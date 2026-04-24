/**
 * 해시태그 연구소 (Hashtag Lab) – Expo Frontend
 *
 * Usage:
 *   1. Copy frontend/.env.example to frontend/.env
 *   2. Set EXPO_PUBLIC_API_URL to your backend URL
 *   3. npx expo start
 */

import React, { useState, useRef } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";

// ---------------------------------------------------------------------------
// API URL configuration
//
// Set EXPO_PUBLIC_API_URL in your .env file or in EAS Build secrets.
// Example:  EXPO_PUBLIC_API_URL=https://your-subdomain.trycloudflare.com
//
// Using a build-time env variable avoids hard-coding the Cloudflare tunnel
// URL in source code (temporary tunnels change every restart).
// ---------------------------------------------------------------------------
const API_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:8001";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ---------------------------------------------------------------------------
// Confetti helpers
// ---------------------------------------------------------------------------
const COLORS = ["#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF", "#FF922B", "#CC5DE8"];

function ConfettiPiece({ x, delay }) {
  const anim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(anim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 600] });
  const opacity = anim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] });
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: 0,
        left: x,
        width: 10,
        height: 10,
        backgroundColor: color,
        borderRadius: 2,
        transform: [{ translateY }, { rotate }],
        opacity,
      }}
    />
  );
}

function Confetti({ visible }) {
  if (!visible) return null;
  const pieces = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    x: Math.random() * SCREEN_WIDTH,
    delay: Math.random() * 400,
  }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p) => (
        <ConfettiPiece key={p.id} x={p.x} delay={p.delay} />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Toast helper
// ---------------------------------------------------------------------------
function showToast(msg) {
  if (Platform.OS === "android") {
    ToastAndroid.show(msg, ToastAndroid.SHORT);
  } else {
    Alert.alert("", msg);
  }
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------
export default function App() {
  const [imageUri, setImageUri] = useState(null);
  const [imageMime, setImageMime] = useState("image/jpeg");
  const [keywords, setKeywords] = useState("");
  const [hashtags, setHashtags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [error, setError] = useState("");

  // ------------------------------------------------------------------
  // Image picker
  // ------------------------------------------------------------------
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("권한 필요", "사진 라이브러리에 접근하려면 권한이 필요합니다.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length > 0) {
      const asset = result.assets[0];
      setImageUri(asset.uri);
      setImageMime(asset.mimeType || "image/jpeg");
      setHashtags([]);
      setError("");
    }
  };

  // ------------------------------------------------------------------
  // Generate hashtags
  // ------------------------------------------------------------------
  const generate = async () => {
    if (!imageUri) {
      Alert.alert("사진 선택", "먼저 사진을 선택해주세요.");
      return;
    }
    setLoading(true);
    setHashtags([]);
    setError("");

    try {
      const formData = new FormData();
      formData.append("image", {
        uri: imageUri,
        name: "photo.jpg",
        type: imageMime,
      });
      // keywords may be Korean – FormData handles UTF-8 correctly on both
      // Android and iOS, so no extra encoding is needed here.
      formData.append("keywords", keywords.trim());

      const response = await fetch(`${API_URL}/generate-hashtags`, {
        method: "POST",
        body: formData,
        headers: {
          // Do NOT set Content-Type manually when using FormData;
          // the fetch implementation adds the correct boundary automatically.
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        let detail = `서버 오류 (${response.status})`;
        try {
          const errBody = await response.json();
          detail = errBody.detail || detail;
        } catch (_) {}
        throw new Error(detail);
      }

      const data = await response.json();
      const tags = data.hashtags || [];

      if (tags.length === 0) {
        setError("해시태그를 생성하지 못했습니다. 다시 시도해주세요.");
      } else {
        setHashtags(tags);
      }
    } catch (err) {
      console.error("generate error:", err);
      setError(
        err.message ||
          "서버에 연결할 수 없습니다. 인터넷 연결과 서버 상태를 확인해주세요."
      );
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // Copy to clipboard
  // ------------------------------------------------------------------
  const copyAll = async () => {
    if (hashtags.length === 0) return;
    const text = hashtags.join(" ");
    await Clipboard.setStringAsync(text);
    showToast("해시태그가 복사되었습니다!");
    triggerConfetti();
  };

  const triggerConfetti = () => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 1600);
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <Confetti visible={showConfetti} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>해시태그 연구소 🔬</Text>
          <Text style={styles.headerSub}>사진과 키워드로 완벽한 해시태그를</Text>
        </View>

        {/* Image picker */}
        <TouchableOpacity style={styles.imagePicker} onPress={pickImage} activeOpacity={0.85}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imagePlaceholderIcon}>📷</Text>
              <Text style={styles.imagePlaceholderText}>사진을 선택하세요</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Keyword input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            placeholder="키워드 입력 (선택) – 예: 여행, 카페, 맛집"
            placeholderTextColor="#888"
            value={keywords}
            onChangeText={setKeywords}
            multiline
            // autoCorrect and spellCheck can interfere with Korean IME
            autoCorrect={false}
            spellCheck={false}
          />
        </View>

        {/* Generate button */}
        <TouchableOpacity
          style={[styles.generateBtn, loading && styles.generateBtnDisabled]}
          onPress={generate}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.generateBtnText}>✨ 해시태그 생성</Text>
          )}
        </TouchableOpacity>

        {/* Error message */}
        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        )}

        {/* Results */}
        {hashtags.length > 0 && (
          <View style={styles.resultsBox}>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsTitle}>생성된 해시태그 ({hashtags.length}개)</Text>
              <TouchableOpacity style={styles.copyBtn} onPress={copyAll}>
                <Text style={styles.copyBtnText}>📋 전체 복사</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.tagsWrap}>
              {hashtags.map((tag, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.tagChip}
                  onPress={async () => {
                    await Clipboard.setStringAsync(tag);
                    showToast(`${tag} 복사됨`);
                  }}
                >
                  <Text style={styles.tagChipText}>{tag}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  scroll: {
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 24,
    backgroundColor: "#16213e",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#e94560",
    letterSpacing: 1,
  },
  headerSub: {
    marginTop: 6,
    fontSize: 14,
    color: "#aaa",
  },
  imagePicker: {
    margin: 20,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#16213e",
    borderWidth: 2,
    borderColor: "#e94560",
    borderStyle: "dashed",
    height: 220,
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  imagePlaceholderIcon: {
    fontSize: 48,
  },
  imagePlaceholderText: {
    marginTop: 12,
    color: "#888",
    fontSize: 16,
  },
  inputRow: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: "#16213e",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#333",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  textInput: {
    color: "#fff",
    fontSize: 15,
    minHeight: 44,
  },
  generateBtn: {
    marginHorizontal: 20,
    backgroundColor: "#e94560",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  generateBtnDisabled: {
    opacity: 0.6,
  },
  generateBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  errorBox: {
    margin: 20,
    backgroundColor: "#2d1a1a",
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: "#e94560",
  },
  errorText: {
    color: "#ff8a80",
    fontSize: 14,
    lineHeight: 20,
  },
  resultsBox: {
    margin: 20,
    backgroundColor: "#16213e",
    borderRadius: 16,
    padding: 16,
  },
  resultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  resultsTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  copyBtn: {
    backgroundColor: "#e94560",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  copyBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagChip: {
    backgroundColor: "#0f3460",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagChipText: {
    color: "#4fc3f7",
    fontSize: 13,
  },
});
