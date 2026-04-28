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
        subtitle: 'Sharper tags for feeds, shorts, and search.',
        addPhoto: 'Add photo',
        changePhoto: 'Change photo',
        clearPhoto: 'Remove photo',
        placeholder: 'Enter keywords (e.g. Seoul BBQ, dessert cafe)',
        generating: 'Analyzing',
        generateBtn: 'Generate Tags',
        requireInput: 'Please add a photo or enter keywords.',
        copySuccess: 'Copied to clipboard.',
        copyBtn: 'Copy',
        emptyResult: 'No tags generated.',
        networkError: 'Network error. Please check your connection.',
        timeoutError: 'Request timed out. Please try again.',
        serverError: 'Server error. Please try again later.',
        rateLimitError: 'Too many requests. Please wait a bit and try again.',
        analysisTitle: 'AI Note',
      },
    },
    ko: {
      translation: {
        title: '해시태그 연구소',
        subtitle: '인스타, 틱톡, 블로그에 맞는 태그를 정교하게 생성합니다.',
        addPhoto: '사진 추가',
        changePhoto: '사진 변경',
        clearPhoto: '사진 제거',
        placeholder: '키워드를 입력하세요 (예: 양지한우집, 양지갈비)',
        generating: '분석 중',
        generateBtn: '태그 생성하기',
        requireInput: '사진을 추가하거나 키워드를 입력해주세요.',
        copySuccess: '복사 완료',
        copyBtn: '복사',
        emptyResult: '생성된 태그가 없습니다.',
        networkError: '네트워크 오류입니다. 연결을 확인해주세요.',
        timeoutError: '요청 시간이 초과됐습니다. 다시 시도해주세요.',
        serverError: '서버 오류입니다. 잠시 후 다시 시도해주세요.',
        rateLimitError: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
        analysisTitle: 'AI 분석',
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
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef(null);

  useEffect(() => {
    if (!loading) {
      pulseAnim.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 520, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 520, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [loading, pulseAnim]);

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

  const loadingScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

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
            <View style={styles.headerCopy}>
              <Text style={styles.header}>{t('title')}</Text>
              <Text style={styles.subtitle}>{t('subtitle')}</Text>
            </View>
            <TouchableOpacity style={styles.langButton} onPress={toggleLanguage}>
              <Text style={styles.langText}>{currentLang === 'ko' ? 'EN' : 'KR'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputPanel}>
            <TouchableOpacity style={[styles.imageCard, image && styles.imageCardFilled]} onPress={pickImage}>
              {image ? (
                <>
                  <Image source={{ uri: image }} style={styles.fullImage} />
                  <View style={styles.photoOverlay}>
                    <Text style={styles.photoOverlayText}>{t('changePhoto')}</Text>
                  </View>
                </>
              ) : (
                <View style={styles.placeholder}>
                  <View style={styles.plusCircle}>
                    <Text style={styles.plus}>+</Text>
                  </View>
                  <Text style={styles.hint}>{t('addPhoto')}</Text>
                </View>
              )}
            </TouchableOpacity>

            {image && (
              <TouchableOpacity
                accessibilityLabel={t('clearPhoto')}
                style={styles.clearImageButton}
                onPress={clearImage}
              >
                <Text style={styles.clearImageText}>×</Text>
              </TouchableOpacity>
            )}

            <TextInput
              style={styles.input}
              placeholder={t('placeholder')}
              placeholderTextColor="#777A83"
              value={keyword}
              onChangeText={setKeyword}
              multiline={false}
              returnKeyType="done"
            />

            <TouchableOpacity style={[styles.mainButton, loading && styles.mainButtonDisabled]} onPress={generateAll} disabled={loading}>
              {loading ? (
                <View style={styles.loadingContainer}>
                  <Animated.View style={[styles.loadingDot, { transform: [{ scale: loadingScale }] }]} />
                  <Text style={styles.buttonText}>{t('generating')}</Text>
                </View>
              ) : (
                <Text style={styles.buttonText}>{t('generateBtn')}</Text>
              )}
            </TouchableOpacity>
          </View>

          {result && (
            <View style={styles.resultSection}>
              <View style={styles.analysisBox}>
                <Text style={styles.analysisTitle}>{t('analysisTitle')}</Text>
                <Text style={styles.aiComment}>{result.analysis || '분석이 완료되었습니다.'}</Text>
              </View>

              <ResultCard title="Instagram" tags={result.instagram || t('emptyResult')} color="#E1306C" onCopy={handleCopy} copyText={t('copyBtn')} />
              <ResultCard title="TikTok" tags={result.tiktok || t('emptyResult')} color="#111111" onCopy={handleCopy} copyText={t('copyBtn')} />
              <ResultCard title="Naver Blog" tags={result.blog || t('emptyResult')} color="#03C75A" onCopy={handleCopy} copyText={t('copyBtn')} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfettiCannon
        count={70}
        origin={{ x: width / 2, y: -20 }}
        autoStart={false}
        ref={confettiRef}
        fadeOut
        fallSpeed={2400}
        explosionSpeed={320}
        colors={['#0A84FF', '#E1306C', '#03C75A', '#F5C542']}
      />
    </SafeAreaView>
  );
}

const ResultCard = ({ title, tags, color, onCopy, copyText }) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <View style={[styles.cardMark, { backgroundColor: color }]} />
      <Text style={styles.cardTitle}>{title}</Text>
    </View>
    <Text style={styles.tagsText}>{tags || ''}</Text>
    <TouchableOpacity style={styles.copyButton} onPress={() => onCopy(tags)}>
      <Text style={styles.copyButtonText}>{copyText || ''}</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0D0E10' },
  flex: { flex: 1 },
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 56 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 },
  headerCopy: { flex: 1, paddingRight: 18 },
  header: { color: '#F5F7FA', fontSize: 28, fontWeight: '900' },
  subtitle: { color: '#8E949E', fontSize: 13, lineHeight: 19, marginTop: 6 },
  langButton: { width: 48, height: 36, borderRadius: 18, backgroundColor: '#1A1D22', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2A2E36' },
  langText: { color: '#DDE4EE', fontSize: 13, fontWeight: '800' },
  inputPanel: { position: 'relative', backgroundColor: '#15171B', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#242832', marginBottom: 20 },
  imageCard: { height: 184, backgroundColor: '#101216', borderRadius: 14, overflow: 'hidden', marginBottom: 14, borderWidth: 1, borderColor: '#2B303A', borderStyle: 'dashed' },
  imageCardFilled: { borderStyle: 'solid', borderColor: '#2F3744' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  plusCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#202733', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  plus: { color: '#8AB4FF', fontSize: 28, fontWeight: '300', lineHeight: 32 },
  hint: { color: '#A1A8B3', fontSize: 14, fontWeight: '700' },
  fullImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoOverlay: { position: 'absolute', left: 10, bottom: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(10, 12, 16, 0.72)' },
  photoOverlayText: { color: '#F2F5F9', fontSize: 12, fontWeight: '800' },
  clearImageButton: { position: 'absolute', right: 24, top: 24, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(8, 10, 14, 0.86)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  clearImageText: { color: '#FFFFFF', fontSize: 24, lineHeight: 27, fontWeight: '300' },
  input: { minHeight: 54, backgroundColor: '#0F1115', color: '#F3F6FA', paddingHorizontal: 16, borderRadius: 12, fontSize: 16, borderWidth: 1, borderColor: '#252A33', marginBottom: 12 },
  mainButton: { backgroundColor: '#0A84FF', minHeight: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  mainButtonDisabled: { backgroundColor: '#355F95' },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  loadingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF', marginRight: 10 },
  buttonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 17 },
  resultSection: { marginTop: 2 },
  analysisBox: { backgroundColor: '#15171B', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#242832' },
  analysisTitle: { color: '#8AB4FF', fontSize: 12, fontWeight: '900', marginBottom: 8 },
  aiComment: { color: '#C9CED6', fontSize: 15, lineHeight: 23 },
  card: { backgroundColor: '#181A1F', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#242832' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardMark: { width: 8, height: 24, borderRadius: 4, marginRight: 10 },
  cardTitle: { color: '#F4F6F9', fontWeight: '900', fontSize: 15 },
  tagsText: { color: '#D7DBE2', fontSize: 16, lineHeight: 25 },
  copyButton: { alignSelf: 'flex-end', marginTop: 14, backgroundColor: '#252932', paddingVertical: 9, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: '#303642' },
  copyButtonText: { color: '#F2F5F9', fontWeight: '800', fontSize: 13 },
});
