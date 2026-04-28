import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import ConfettiCannon from 'react-native-confetti-cannon';

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://hastaglab-production-eab7.up.railway.app'
).replace(/\/$/, '');

i18n.use(initReactI18next).init({
  compatibilityJSON: 'v3',
  lng: 'ko',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        title: 'Hashtag Lab',
        addPhoto: 'Add a photo (Optional)',
        changePhoto: 'Change photo',
        clearPhoto: 'Remove photo',
        placeholder: 'Enter keywords (e.g. Seoul BBQ, dessert cafe)',
        generating: 'AI is analyzing...',
        generateBtn: 'Generate AI Tags',
        requireInput: 'Please add a photo or enter keywords.',
        copySuccess: 'Copied to clipboard.',
        copyBtn: 'Copy',
        emptyResult: 'No tags generated.',
        networkError: 'Network error. Please check your connection.',
        timeoutError: 'Request timed out. Please try again.',
        serverError: 'Server error. Please try again later.',
        rateLimitError: 'Too many requests. Please wait a bit and try again.',
        adLabel: 'Ad',
      },
    },
    ko: {
      translation: {
        title: '해시태그 연구소',
        addPhoto: '사진 추가 (선택사항)',
        changePhoto: '사진 변경',
        clearPhoto: '사진 제거',
        placeholder: '키워드를 입력하세요 (예: 양지한우집, 양지갈비)',
        generating: 'AI가 열심히 분석 중...',
        generateBtn: 'AI 태그 생성하기',
        requireInput: '사진을 추가하거나 키워드를 입력해주세요.',
        copySuccess: '복사 완료',
        copyBtn: '복사하기',
        emptyResult: '생성된 태그가 없습니다.',
        networkError: '네트워크 오류입니다. 연결을 확인해주세요.',
        timeoutError: '요청 시간이 초과됐습니다. 다시 시도해주세요.',
        serverError: '서버 오류입니다. 잠시 후 다시 시도해주세요.',
        rateLimitError: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
        adLabel: '광고',
      },
    },
  },
});

const { width } = Dimensions.get('window');
const TIMEOUT_MS = 60000;

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

  useEffect(() => {
    if (!loading) {
      bounceAnim.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -8, duration: 300, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [loading, bounceAnim]);

  const toggleLanguage = () => {
    const nextLang = currentLang === 'ko' ? 'en' : 'ko';
    i18n.changeLanguage(nextLang);
    setCurrentLang(nextLang);
  };

  const clearImage = () => {
    setImage(null);
    setBase64Image('');
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '사진 접근 권한이 필요합니다. 설정에서 허용해주세요.');
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.25,
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
      } else if (e.message === 'HTTP_429') {
        Alert.alert('오류', t('rateLimitError'));
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
    confettiRef.current?.start();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <Text style={styles.header}>{t('title')}</Text>
            <TouchableOpacity style={styles.langButton} onPress={toggleLanguage}>
              <Text style={styles.langText}>{currentLang === 'ko' ? '🇺🇸 EN' : '🇰🇷 KR'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.imageWrap}>
            <TouchableOpacity style={styles.imageCard} onPress={pickImage}>
              {image ? (
                <>
                  <Image source={{ uri: image }} style={styles.fullImage} />
                  <View style={styles.changePhotoBadge}>
                    <Text style={styles.changePhotoText}>{t('changePhoto')}</Text>
                  </View>
                </>
              ) : (
                <View style={styles.placeholder}>
                  <Text style={styles.plus}>+</Text>
                  <Text style={styles.hint}>{t('addPhoto')}</Text>
                </View>
              )}
            </TouchableOpacity>

            {image && (
              <TouchableOpacity style={styles.clearImageButton} onPress={clearImage} accessibilityLabel={t('clearPhoto')}>
                <Text style={styles.clearImageText}>×</Text>
              </TouchableOpacity>
            )}
          </View>

          <TextInput
            style={styles.input}
            placeholder={t('placeholder')}
            placeholderTextColor="#888"
            value={keyword}
            onChangeText={setKeyword}
            multiline={false}
            returnKeyType="done"
          />

          <TouchableOpacity style={[styles.mainButton, loading && styles.mainButtonLoading]} onPress={generateAll} disabled={loading}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <Animated.Text style={[styles.robotIcon, { transform: [{ translateY: bounceAnim }] }]}>🤖</Animated.Text>
                <Text style={styles.buttonText}>{t('generating')}</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>{t('generateBtn')}</Text>
            )}
          </TouchableOpacity>

          <AdPlaceholder label={t('adLabel')} />

          {result && (
            <View style={styles.resultSection}>
              <Text style={styles.aiComment}>{result.analysis || '분석이 완료되었습니다.'}</Text>
              <ResultCard title="Instagram" tags={result.instagram || t('emptyResult')} color="#E1306C" onCopy={handleCopy} copyText={t('copyBtn')} />
              <ResultCard title="TikTok" tags={result.tiktok || t('emptyResult')} color="#050505" onCopy={handleCopy} copyText={t('copyBtn')} />
              <ResultCard title="Naver Blog" tags={result.blog || t('emptyResult')} color="#03C75A" onCopy={handleCopy} copyText={t('copyBtn')} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfettiCannon
        count={80}
        origin={{ x: width / 2, y: -20 }}
        autoStart={false}
        ref={confettiRef}
        fadeOut
        fallSpeed={2500}
        explosionSpeed={350}
        colors={['#007AFF', '#E1306C', '#03C75A', '#FFD700']}
      />
    </SafeAreaView>
  );
}

const AdPlaceholder = ({ label }) => (
  <View style={styles.adSlot}>
    <Text style={styles.adText}>{label}</Text>
  </View>
);

const ResultCard = ({ title, tags, color, onCopy, copyText }) => (
  <View style={styles.card}>
    <View style={[styles.cardTag, { backgroundColor: color }]}>
      <Text style={styles.cardTitle}>{title}</Text>
    </View>
    <Text style={styles.tagsText}>{tags || ''}</Text>
    <TouchableOpacity style={styles.copyButton} onPress={() => onCopy(tags)}>
      <Text style={styles.copyButtonText}>{copyText || ''}</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#121212' },
  flex: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 34, paddingBottom: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  header: { flex: 1, color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginRight: 16 },
  langButton: { backgroundColor: '#333333', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 22 },
  langText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  imageWrap: { position: 'relative', marginBottom: 20 },
  imageCard: { width: '100%', height: 210, backgroundColor: '#1E1E1E', borderRadius: 20, overflow: 'hidden', borderStyle: 'dashed', borderWidth: 1.5, borderColor: '#3A3A3A' },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  plus: { fontSize: 48, color: '#007AFF', marginBottom: 14, fontWeight: '300' },
  hint: { color: '#8E8E93', fontSize: 16, fontWeight: '700' },
  fullImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  changePhotoBadge: { position: 'absolute', left: 12, bottom: 12, backgroundColor: 'rgba(0,0,0,0.58)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  changePhotoText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  clearImageButton: { position: 'absolute', right: 12, top: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  clearImageText: { color: '#FFFFFF', fontSize: 25, lineHeight: 28, fontWeight: '300' },
  input: { backgroundColor: '#1E1E1E', color: '#FFFFFF', minHeight: 58, paddingHorizontal: 16, borderRadius: 14, fontSize: 16, marginBottom: 16, borderBottomWidth: 2, borderBottomColor: '#007AFF' },
  mainButton: { backgroundColor: '#007AFF', minHeight: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  mainButtonLoading: { backgroundColor: '#0A84FF' },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  robotIcon: { fontSize: 28, marginRight: 12 },
  buttonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 19 },
  adSlot: { height: 54, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#333333', backgroundColor: '#171717', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  adText: { color: '#666666', fontSize: 12, fontWeight: '800', letterSpacing: 0 },
  resultSection: { marginTop: 2 },
  aiComment: { color: '#A7A7A7', marginBottom: 16, fontStyle: 'italic', textAlign: 'center', fontSize: 16, lineHeight: 24 },
  card: { backgroundColor: '#1E1E1E', borderRadius: 16, padding: 16, marginBottom: 16 },
  cardTag: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginBottom: 14 },
  cardTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
  tagsText: { color: '#D0D0D0', fontSize: 16, lineHeight: 25 },
  copyButton: { alignSelf: 'flex-end', marginTop: 16, backgroundColor: '#333333', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 },
  copyButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
});
