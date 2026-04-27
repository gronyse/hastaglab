import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView,
  Image, Alert, Dimensions, KeyboardAvoidingView, Platform, Animated
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import ConfettiCannon from 'react-native-confetti-cannon';
import * as Haptics from 'expo-haptics';
import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

// ✅ Railway 백엔드 URL
const API_BASE_URL = 'https://hastaglab-production.up.railway.app';

i18n.use(initReactI18next).init({
  compatibilityJSON: 'v3',
  lng: 'ko',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        title: "Hashtag Lab",
        addPhoto: "Add a photo (Optional)",
        placeholder: "Enter keywords (e.g. Dog, Cute)",
        generating: "AI is analyzing...",
        generateBtn: "Generate AI Tags",
        requireInput: "Please add a photo or enter keywords!",
        copySuccess: "Copied to clipboard!",
        copyBtn: "Copy",
        emptyResult: "No tags generated.",
        networkError: "Network error. Please check your connection.",
        timeoutError: "Request timed out. Please try again.",
        serverError: "Server error. Please try again later."
      }
    },
    ko: {
      translation: {
        title: "해시태그 연구소",
        addPhoto: "사진 추가 (선택사항)",
        placeholder: "키워드를 입력하세요 (예: 강아지, 귀여운)",
        generating: "AI가 열심히 분석 중...",
        generateBtn: "AI 태그 생성하기",
        requireInput: "사진을 추가하거나 키워드를 입력해주세요!",
        copySuccess: "복사 완료!",
        copyBtn: "복사하기",
        emptyResult: "생성된 태그가 없습니다.",
        networkError: "네트워크 오류입니다. 연결을 확인해주세요.",
        timeoutError: "요청 시간이 초과됐습니다. 다시 시도해주세요.",
        serverError: "서버 오류입니다. 잠시 후 다시 시도해주세요."
      }
    }
  }
});

const { width } = Dimensions.get('window');
const TIMEOUT_MS = 60000; // 60초 (이미지+Pro 모델 대응)

export default function App() {
  const { t } = useTranslation();
  const [currentLang, setCurrentLang] = useState('ko');
  const [keyword, setKeyword] = useState('');
  const [image, setImage] = useState(null);
  const [base64Image, setBase64Image] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const confettiRef = useRef(null);
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef(null);

  const toggleLanguage = () => {
    const nextLang = currentLang === 'ko' ? 'en' : 'ko';
    i18n.changeLanguage(nextLang);
    setCurrentLang(nextLang);
  };

  useEffect(() => {
    if (loading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(bounceAnim, { toValue: -8, duration: 300, useNativeDriver: true }),
          Animated.timing(bounceAnim, { toValue: 0, duration: 300, useNativeDriver: true })
        ])
      ).start();
    } else {
      bounceAnim.setValue(0);
    }
  }, [loading]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '사진 접근 권한이 필요합니다. 설정에서 허용해주세요.');
      return;
    }
    let res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.2,
      maxWidth: 800,
      base64: true,
    });
    if (!res.canceled) {
      setImage(res.assets[0].uri);
      setBase64Image(res.assets[0].base64);
    }
  };

  const generateAll = async () => {
    if (!base64Image && keyword.trim() === '') {
      Alert.alert(t('requireInput'));
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, image: base64Image || null, language: currentLang }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }

      const data = await response.json();
      setResult(data);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 200);

    } catch (e) {
      clearTimeout(timeoutId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      if (e.name === 'AbortError') {
        Alert.alert('오류', t('timeoutError'));
      } else if (e.message?.startsWith('HTTP_5')) {
        Alert.alert('오류', t('serverError'));
      } else if (e.message?.startsWith('HTTP_')) {
        Alert.alert('오류', `요청 오류: ${e.message}`);
      } else {
        Alert.alert('오류', t('networkError'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (tags) => {
    if (!tags) return;
    await Clipboard.setStringAsync(tags);
    if (confettiRef.current) confettiRef.current.start();
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView ref={scrollViewRef} style={styles.container} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">

          <View style={styles.headerRow}>
            <Text style={styles.header}>{t('title')}</Text>
            <TouchableOpacity style={styles.langButton} onPress={toggleLanguage}>
              <Text style={styles.langText}>{currentLang === 'ko' ? '🇺🇸 EN' : '🇰🇷 KR'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.imageCard} onPress={pickImage}>
            {image ? (
              <Image source={{ uri: image }} style={styles.fullImage} />
            ) : (
              <View style={styles.placeholder}>
                <Text style={styles.plus}>+</Text>
                <Text style={styles.hint}>{t('addPhoto')}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder={t('placeholder')}
            placeholderTextColor="#888"
            value={keyword}
            onChangeText={setKeyword}
            multiline={false}
          />

          <TouchableOpacity style={styles.mainButton} onPress={generateAll} disabled={loading}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <Animated.Text style={[styles.robotIcon, { transform: [{ translateY: bounceAnim }] }]}>🤖</Animated.Text>
                <Text style={styles.buttonText}>{t('generating')}</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>{t('generateBtn')}</Text>
            )}
          </TouchableOpacity>

          {result && (
            <View style={styles.resultSection}>
              <Text style={styles.aiComment}>💬 {result.analysis || '분석이 완료되었습니다.'}</Text>
              <ResultCard title="Instagram" tags={result.instagram || t('emptyResult')} color="#E1306C" onCopy={handleCopy} copyText={t('copyBtn')} />
              <ResultCard title="TikTok" tags={result.tiktok || t('emptyResult')} color="#000000" onCopy={handleCopy} copyText={t('copyBtn')} />
              <ResultCard title="Naver Blog" tags={result.blog || t('emptyResult')} color="#03C75A" onCopy={handleCopy} copyText={t('copyBtn')} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfettiCannon count={80} origin={{ x: width / 2, y: -20 }} autoStart={false} ref={confettiRef} fadeOut={true} fallSpeed={2500} explosionSpeed={350} colors={['#007AFF', '#E1306C', '#03C75A', '#FFD700']} />
    </View>
  );
}

const ResultCard = ({ title, tags, color, onCopy, copyText }) => (
  <View style={styles.card}>
    <View style={[styles.cardTag, { backgroundColor: color }]}>
      <Text style={styles.cardTitle}>{title}</Text>
    </View>
    <Text style={styles.tagsText}>{tags || ""}</Text>
    <TouchableOpacity style={styles.copyButton} onPress={() => onCopy(tags)}>
      <Text style={styles.emojiText}>📋</Text>
      <Text style={styles.copyButtonText}>{copyText || ""}</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 40, marginBottom: 20 },
  header: { fontSize: 26, fontWeight: '900', color: '#fff' },
  langButton: { backgroundColor: '#333', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  langText: { color: '#fff', fontWeight: 'bold' },
  imageCard: { width: '100%', height: 200, backgroundColor: '#1E1E1E', borderRadius: 20, overflow: 'hidden', marginBottom: 20, borderStyle: 'dashed', borderWidth: 1, borderColor: '#333' },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  plus: { fontSize: 40, color: '#007AFF', marginBottom: 10 },
  hint: { color: '#888', fontSize: 14 },
  fullImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  input: { backgroundColor: '#1E1E1E', color: '#fff', padding: 15, borderRadius: 12, fontSize: 16, marginBottom: 15, borderBottomWidth: 2, borderBottomColor: '#007AFF' },
  mainButton: { backgroundColor: '#007AFF', padding: 10, borderRadius: 12, alignItems: 'center', minHeight: 60, justifyContent: 'center' },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  robotIcon: { fontSize: 24, marginRight: 10 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 17 },
  resultSection: { marginTop: 20 },
  aiComment: { color: '#A0A0A0', marginBottom: 15, fontStyle: 'italic', textAlign: 'center' },
  card: { backgroundColor: '#1E1E1E', borderRadius: 15, padding: 15, marginBottom: 15 },
  cardTag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginBottom: 10 },
  cardTitle: { color: '#fff', fontWeight: 'bold', fontSize: 11 },
  tagsText: { color: '#ccc', fontSize: 15, lineHeight: 22 },
  copyButton: { alignSelf: 'flex-end', marginTop: 15, backgroundColor: '#333', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 13, marginRight: 5 },
  copyButtonText: { color: '#fff', fontWeight: '600', fontSize: 13, includeFontPadding: false }
});
