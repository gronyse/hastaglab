import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
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
        placeholder: 'e.g. Seoul cafe, spring outfit, travel reel',
        keywordHelp: 'Keywords alone are enough. Add 2-3 details separated by commas for better tags.',
        generating: 'Generating AI tags...',
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
        stylesLabel: 'Style',
        reset: 'Reset',
        regenerate: 'Regenerate',
        saveHistory: 'Save',
        saved: 'Saved',
        favorite: 'Favorite',
        excludePlaceholder: 'Words to exclude (optional)',
        freeCount: 'Today {{used}}/{{limit}} generations',
        recentTitle: 'Recent',
        favoriteTitle: 'Favorites',
        copyStats: 'Copies',
        exampleTitle: 'Examples',
      },
    },
    ko: {
      translation: {
        title: '해시태그 연구소',
        addPhoto: '사진 추가 (선택사항)',
        changePhoto: '사진 변경',
        clearPhoto: '사진 제거',
        placeholder: '예: 제주 감성 카페, 봄 데일리룩',
        keywordHelp: '키워드만 입력해도 됩니다. 쉼표로 2-3개를 나누면 더 정확해요.',
        generating: 'AI 태그를 생성 중...',
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
        stylesLabel: '스타일',
        reset: '초기화',
        regenerate: '다시 생성',
        saveHistory: '기록 저장',
        saved: '저장됨',
        favorite: '즐겨찾기',
        excludePlaceholder: '제외할 단어 (선택)',
        freeCount: '오늘 {{used}}/{{limit}}회 생성',
        recentTitle: '최근 기록',
        favoriteTitle: '즐겨찾기',
        copyStats: '복사 기록',
        exampleTitle: '예시',
      },
    },
  },
});

const { width, height } = Dimensions.get('window');
const TIMEOUT_MS = 60000;
const DAILY_LIMIT_FALLBACK = 20;
const STORAGE_KEYS = {
  recent: 'hastaglab.recent',
  favorites: 'hastaglab.favorites',
  copyStats: 'hastaglab.copyStats',
  usage: 'hastaglab.usage',
};
const STYLE_OPTIONS = [
  { key: 'trendy', ko: '트렌디', en: 'Trendy' },
  { key: 'seo', ko: 'SEO', en: 'SEO' },
  { key: 'mood', ko: '감성', en: 'Mood' },
  { key: 'food', ko: '맛집', en: 'Food' },
  { key: 'shop', ko: '쇼핑몰', en: 'Shop' },
  { key: 'travel', ko: '여행', en: 'Travel' },
];
const EXAMPLE_KEYWORDS = {
  ko: ['맛집', '카페', '오늘의착장', '여행', '쇼핑몰'],
  en: ['Food spot', 'Cafe', 'OOTD', 'Travel', 'Shop'],
};

export default function App() {
  const { t } = useTranslation();
  const [currentLang, setCurrentLang] = useState('ko');
  const [keyword, setKeyword] = useState('');
  const [image, setImage] = useState(null);
  const [base64Image, setBase64Image] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedStyles, setSelectedStyles] = useState([]);
  const [excludeInput, setExcludeInput] = useState('');
  const [variant, setVariant] = useState(0);
  const [dailyUsage, setDailyUsage] = useState({ used: 0, limit: DAILY_LIMIT_FALLBACK });
  const [recentHistory, setRecentHistory] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [copyStats, setCopyStats] = useState({ Instagram: 0, TikTok: 0, Blog: 0 });

  const confettiRef = useRef(null);
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const robotBurstAnim = useRef(new Animated.Value(0)).current;
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

  useEffect(() => {
    const loadSavedData = async () => {
      try {
        const [recentRaw, favoritesRaw, copyRaw, usageRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.recent),
          AsyncStorage.getItem(STORAGE_KEYS.favorites),
          AsyncStorage.getItem(STORAGE_KEYS.copyStats),
          AsyncStorage.getItem(STORAGE_KEYS.usage),
        ]);
        if (recentRaw) setRecentHistory(JSON.parse(recentRaw));
        if (favoritesRaw) setFavorites(JSON.parse(favoritesRaw));
        if (copyRaw) setCopyStats(JSON.parse(copyRaw));
        if (usageRaw) {
          const usage = JSON.parse(usageRaw);
          const today = new Date().toISOString().slice(0, 10);
          if (usage.date === today) {
            setDailyUsage({ used: usage.used || 0, limit: usage.limit || DAILY_LIMIT_FALLBACK });
          }
        }
      } catch {
      }
    };
    loadSavedData();
  }, []);

  const toggleLanguage = () => {
    const nextLang = currentLang === 'ko' ? 'en' : 'ko';
    i18n.changeLanguage(nextLang);
    setCurrentLang(nextLang);
  };

  const clearImage = () => {
    setImage(null);
    setBase64Image('');
  };

  const todayKey = () => new Date().toISOString().slice(0, 10);

  const persistJson = async (key, value) => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
    }
  };

  const updateLocalUsage = async (quota) => {
    const nextUsage = quota
      ? { used: quota.used || 0, limit: quota.limit || DAILY_LIMIT_FALLBACK }
      : { used: Math.min(dailyUsage.used + 1, dailyUsage.limit), limit: dailyUsage.limit };
    setDailyUsage(nextUsage);
    await persistJson(STORAGE_KEYS.usage, { ...nextUsage, date: todayKey() });
  };

  const toggleStyle = (styleKey) => {
    setSelectedStyles((prev) => (
      prev.includes(styleKey) ? prev.filter((item) => item !== styleKey) : [...prev, styleKey]
    ));
  };

  const resetAll = () => {
    setKeyword('');
    setImage(null);
    setBase64Image('');
    setResult(null);
    setSelectedStyles([]);
    setExcludeInput('');
    setVariant(0);
  };

  const triggerCopyAnimation = () => {
    confettiRef.current?.start();
    robotBurstAnim.stopAnimation();
    robotBurstAnim.setValue(0);
    Animated.timing(robotBurstAnim, {
      toValue: 1,
      duration: 1700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      robotBurstAnim.setValue(0);
    });
  };

  const saveRecent = async () => {
    if (!result) return;
    const item = {
      id: `${Date.now()}`,
      keyword: keyword.trim() || '이미지 분석',
      styles: selectedStyles,
      result,
      createdAt: new Date().toISOString(),
    };
    const next = [item, ...recentHistory.filter((entry) => entry.keyword !== item.keyword)].slice(0, 8);
    setRecentHistory(next);
    await persistJson(STORAGE_KEYS.recent, next);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const saveFavorite = async (title, tags) => {
    if (!tags) return;
    const item = {
      id: `${Date.now()}`,
      title,
      keyword: keyword.trim() || '이미지 분석',
      tags,
    };
    const next = [item, ...favorites.filter((entry) => entry.tags !== tags)].slice(0, 12);
    setFavorites(next);
    await persistJson(STORAGE_KEYS.favorites, next);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const recordCopy = async (platformName) => {
    const next = { ...copyStats, [platformName]: (copyStats[platformName] || 0) + 1 };
    setCopyStats(next);
    await persistJson(STORAGE_KEYS.copyStats, next);
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

  const generateAll = async (options = {}) => {
    if (!base64Image && keyword.trim() === '') {
      Alert.alert(t('requireInput'));
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const nextVariant = options.regenerate ? variant + 1 : variant;
    const excludeWords = excludeInput
      .split(/[,;\s]+/)
      .map((word) => word.trim())
      .filter(Boolean)
      .slice(0, 12);

    try {
      const response = await fetch(`${API_BASE_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword,
          image: base64Image || null,
          language: currentLang,
          styles: selectedStyles,
          variant: nextVariant,
          exclude_words: excludeWords,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }

      const data = await response.json();
      const newResult = {
        instagram: data.instagram || '',
        tiktok: data.tiktok || '',
        blog: data.blog || '',
        analysis: data.analysis || '분석이 완료되었습니다.',
        policy: data.policy || null,
      };
      setResult(newResult);
      setVariant(nextVariant);
      await updateLocalUsage(data.quota);

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

  const copyTags = async (tagsStr, platformName) => {
    if (!tagsStr) return;
    await Clipboard.setStringAsync(tagsStr);
    await recordCopy(platformName);
    triggerCopyAnimation();
  };

  const robotBurstStyle = {
    opacity: robotBurstAnim.interpolate({
      inputRange: [0, 0.2, 0.8, 1],
      outputRange: [0, 1, 1, 0],
    }),
    transform: [
      {
        translateX: robotBurstAnim.interpolate({
          inputRange: [0, 0.25, 0.62, 1],
          outputRange: [0, -36, 28, 12],
        }),
      },
      {
        translateY: robotBurstAnim.interpolate({
          inputRange: [0, 0.22, 1],
          outputRange: [0, -124, height * 0.72],
        }),
      },
      {
        rotate: robotBurstAnim.interpolate({
          inputRange: [0, 0.25, 0.62, 1],
          outputRange: ['0deg', '-18deg', '16deg', '42deg'],
        }),
      },
      {
        scale: robotBurstAnim.interpolate({
          inputRange: [0, 0.2, 1],
          outputRange: [0.72, 1.18, 0.96],
        }),
      },
    ],
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        style={styles.flex}
      >
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
          <View style={styles.metaRow}>
            <Text style={styles.freeCount}>{t('freeCount', dailyUsage)}</Text>
            <TouchableOpacity style={styles.smallGhostButton} onPress={resetAll}>
              <Text style={styles.smallGhostText}>{t('reset')}</Text>
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
          <Text style={styles.inputHelp}>{t('keywordHelp')}</Text>

          <View style={styles.examplesWrap}>
            <Text style={styles.sectionLabel}>{t('exampleTitle')}</Text>
            <View style={styles.chipRow}>
              {EXAMPLE_KEYWORDS[currentLang].map((item) => (
                <TouchableOpacity key={item} style={styles.exampleChip} onPress={() => setKeyword(item)}>
                  <Text style={styles.exampleChipText}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.stylesWrap}>
            <Text style={styles.sectionLabel}>{t('stylesLabel')}</Text>
            <View style={styles.chipRow}>
              {STYLE_OPTIONS.map((item) => {
                const selected = selectedStyles.includes(item.key);
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.styleChip, selected && styles.styleChipSelected]}
                    onPress={() => toggleStyle(item.key)}
                  >
                    <Text style={[styles.styleChipText, selected && styles.styleChipTextSelected]}>
                      {currentLang === 'ko' ? item.ko : item.en}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <TextInput
            style={styles.excludeInput}
            placeholder={t('excludePlaceholder')}
            placeholderTextColor="#70757D"
            value={excludeInput}
            onChangeText={setExcludeInput}
            multiline={false}
            returnKeyType="done"
          />

          <TouchableOpacity style={[styles.mainButton, loading && styles.mainButtonLoading]} onPress={() => generateAll()} disabled={loading}>
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
              <View style={styles.resultActions}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => generateAll({ regenerate: true })} disabled={loading}>
                  <Text style={styles.secondaryButtonText}>{t('regenerate')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={saveRecent}>
                  <Text style={styles.secondaryButtonText}>{t('saveHistory')}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.aiComment}>{result.analysis || '분석이 완료되었습니다.'}</Text>
              <ResultCard title="Instagram" tags={result.instagram || t('emptyResult')} color="#E1306C" onCopy={copyTags} onFavorite={saveFavorite} copyText={t('copyBtn')} favoriteText={t('favorite')} />
              <ResultCard title="TikTok" tags={result.tiktok || t('emptyResult')} color="#050505" onCopy={copyTags} onFavorite={saveFavorite} copyText={t('copyBtn')} favoriteText={t('favorite')} />
              <ResultCard title="Naver Blog" tags={result.blog || t('emptyResult')} color="#03C75A" platformName="Blog" onCopy={copyTags} onFavorite={saveFavorite} copyText={t('copyBtn')} favoriteText={t('favorite')} />
            </View>
          )}

          <SavedPanel
            recentHistory={recentHistory}
            favorites={favorites}
            copyStats={copyStats}
            labels={{
              recentTitle: t('recentTitle'),
              favoriteTitle: t('favoriteTitle'),
              copyStats: t('copyStats'),
            }}
            onUseHistory={(item) => {
              setKeyword(item.keyword === '이미지 분석' ? '' : item.keyword);
              setResult(item.result);
              setSelectedStyles(item.styles || []);
            }}
            onCopy={copyTags}
          />
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
      <Animated.Text pointerEvents="none" style={[styles.robotBurst, robotBurstStyle]}>
        🤖
      </Animated.Text>
    </SafeAreaView>
  );
}

const AdPlaceholder = ({ label }) => (
  <View style={styles.adSlot}>
    <Text style={styles.adText}>{label}</Text>
  </View>
);

const ResultCard = ({ title, tags, color, platformName, onCopy, onFavorite, copyText, favoriteText }) => {
  const copyName = platformName || title;
  return (
  <View style={styles.card}>
    <View style={[styles.cardTag, { backgroundColor: color }]}>
      <Text style={styles.cardTitle}>{title}</Text>
    </View>
    <Text style={styles.tagsText}>{tags || ''}</Text>
    <View style={styles.cardActions}>
      <TouchableOpacity style={styles.favoriteButton} onPress={() => onFavorite(title, tags)}>
        <Text style={styles.favoriteButtonText}>{favoriteText || ''}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.copyButton} onPress={() => onCopy(tags, copyName)}>
        <Text style={styles.copyButtonText}>{copyText || ''}</Text>
      </TouchableOpacity>
    </View>
  </View>
  );
};

const SavedPanel = ({ recentHistory, favorites, copyStats, labels, onUseHistory, onCopy }) => {
  if (!recentHistory.length && !favorites.length) {
    return (
      <View style={styles.statsLine}>
        <Text style={styles.statsText}>
          {labels.copyStats}: Instagram {copyStats.Instagram || 0} · TikTok {copyStats.TikTok || 0} · Blog {copyStats.Blog || 0}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.savedPanel}>
      <Text style={styles.savedTitle}>{labels.copyStats}</Text>
      <Text style={styles.statsText}>
        Instagram {copyStats.Instagram || 0} · TikTok {copyStats.TikTok || 0} · Blog {copyStats.Blog || 0}
      </Text>

      {recentHistory.length > 0 && (
        <>
          <Text style={styles.savedTitle}>{labels.recentTitle}</Text>
          {recentHistory.slice(0, 4).map((item) => (
            <TouchableOpacity key={item.id} style={styles.savedItem} onPress={() => onUseHistory(item)}>
              <Text style={styles.savedItemTitle} numberOfLines={1}>{item.keyword}</Text>
              <Text style={styles.savedItemSub} numberOfLines={1}>{item.result?.instagram || ''}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      {favorites.length > 0 && (
        <>
          <Text style={styles.savedTitle}>{labels.favoriteTitle}</Text>
          {favorites.slice(0, 4).map((item) => (
            <TouchableOpacity key={item.id} style={styles.savedItem} onPress={() => onCopy(item.tags, item.title.includes('Blog') ? 'Blog' : item.title)}>
              <Text style={styles.savedItemTitle} numberOfLines={1}>{item.title} · {item.keyword}</Text>
              <Text style={styles.savedItemSub} numberOfLines={1}>{item.tags}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#121212' },
  flex: { flex: 1 },
  container: { flex: 1 },
  content: { flexGrow: 1, padding: 20, paddingTop: 34, paddingBottom: 96 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  header: { flex: 1, color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginRight: 16 },
  langButton: { backgroundColor: '#333333', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 22 },
  langText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  freeCount: { color: '#8E8E93', fontSize: 13, fontWeight: '800' },
  smallGhostButton: { borderWidth: 1, borderColor: '#2B3038', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  smallGhostText: { color: '#AAB2BF', fontSize: 12, fontWeight: '900' },
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
  input: { backgroundColor: '#1E1E1E', color: '#FFFFFF', minHeight: 58, paddingHorizontal: 16, borderRadius: 14, fontSize: 16, marginBottom: 8, borderBottomWidth: 2, borderBottomColor: '#007AFF' },
  inputHelp: { color: '#8E8E93', fontSize: 13, lineHeight: 19, marginBottom: 18, paddingHorizontal: 2 },
  examplesWrap: { marginBottom: 14 },
  stylesWrap: { marginBottom: 14 },
  sectionLabel: { color: '#8FB6FF', fontSize: 13, fontWeight: '900', marginBottom: 9 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  exampleChip: { backgroundColor: '#20242B', borderWidth: 1, borderColor: '#2E3540', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  exampleChipText: { color: '#C9D0DB', fontSize: 13, fontWeight: '800' },
  styleChip: { backgroundColor: '#171A20', borderWidth: 1, borderColor: '#2D333D', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  styleChipSelected: { backgroundColor: '#0A84FF', borderColor: '#0A84FF' },
  styleChipText: { color: '#AEB6C2', fontSize: 13, fontWeight: '900' },
  styleChipTextSelected: { color: '#FFFFFF' },
  excludeInput: { backgroundColor: '#171A20', color: '#FFFFFF', minHeight: 46, paddingHorizontal: 14, borderRadius: 12, fontSize: 14, marginBottom: 16, borderWidth: 1, borderColor: '#2B3038' },
  mainButton: { backgroundColor: '#007AFF', minHeight: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  mainButtonLoading: { backgroundColor: '#0A84FF' },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  robotIcon: { fontSize: 28, marginRight: 12 },
  buttonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 19 },
  adSlot: { height: 54, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#333333', backgroundColor: '#171717', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  adText: { color: '#666666', fontSize: 12, fontWeight: '800', letterSpacing: 0 },
  resultSection: { marginTop: 2 },
  resultActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginBottom: 12 },
  secondaryButton: { backgroundColor: '#20242B', borderWidth: 1, borderColor: '#303844', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  secondaryButtonText: { color: '#DCE5F2', fontSize: 12, fontWeight: '900' },
  aiComment: { color: '#A7A7A7', marginBottom: 16, fontStyle: 'italic', textAlign: 'center', fontSize: 16, lineHeight: 24 },
  card: { backgroundColor: '#1E1E1E', borderRadius: 16, padding: 16, marginBottom: 16 },
  cardTag: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginBottom: 14 },
  cardTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
  tagsText: { color: '#D0D0D0', fontSize: 16, lineHeight: 25 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 16 },
  favoriteButton: { backgroundColor: '#242933', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  favoriteButtonText: { color: '#B9C4D2', fontWeight: '800', fontSize: 13 },
  copyButton: { backgroundColor: '#333333', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 },
  copyButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  statsLine: { marginTop: 4, marginBottom: 12 },
  statsText: { color: '#777F8C', fontSize: 12, lineHeight: 18, fontWeight: '700' },
  savedPanel: { backgroundColor: '#15171C', borderWidth: 1, borderColor: '#242A33', borderRadius: 16, padding: 14, marginTop: 4, marginBottom: 20 },
  savedTitle: { color: '#8FB6FF', fontSize: 13, fontWeight: '900', marginTop: 8, marginBottom: 8 },
  savedItem: { borderTopWidth: 1, borderTopColor: '#252B34', paddingVertical: 10 },
  savedItemTitle: { color: '#E5EAF2', fontSize: 13, fontWeight: '900', marginBottom: 4 },
  savedItemSub: { color: '#8992A1', fontSize: 12, lineHeight: 17 },
  robotBurst: { position: 'absolute', left: width / 2 - 24, top: 88, fontSize: 42, zIndex: 20 },
});
