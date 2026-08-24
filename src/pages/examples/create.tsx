import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { supabaseClient } from '../../providers/supabase-client';
import { useDashboardStore } from '../../store/dashboardStore';

interface OptionItem {
  id: string;
  text: string;
  isCorrect: boolean;
}

type FilePickerOptions = {
  id: string;
  accept: string;
};

type PickerWindow = Window & typeof globalThis & {
  showOpenFilePicker: (options: {
    id: string;
    multiple: boolean;
    startIn?: FileSystemDirectoryHandle;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ getFile: () => Promise<File> }[]>;
};

type PermissionDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission: (options: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission: (options: { mode: 'read' }) => Promise<PermissionState>;
};

const pickerDatabaseName = 'example-file-picker-database';
const pickerStoreName = 'directories';
const draftStoreName = 'draft-files';

const openPickerDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(pickerDatabaseName, 2);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(pickerStoreName)) {
      request.result.createObjectStore(pickerStoreName);
    }
    if (!request.result.objectStoreNames.contains(draftStoreName)) {
      request.result.createObjectStore(draftStoreName);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const loadDirectory = async (id: string) => {
  const database = await openPickerDatabase();
  return new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
    const request = database.transaction(pickerStoreName, 'readonly').objectStore(pickerStoreName).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveDraftFile = async (key: string, file: File | null) => {
  const database = await openPickerDatabase();
  return new Promise<void>((resolve, reject) => {
    const store = database.transaction(draftStoreName, 'readwrite').objectStore(draftStoreName);
    const request = file ? store.put(file, key) : store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const loadDraftFile = async (key: string) => {
  const database = await openPickerDatabase();
  return new Promise<File | undefined>((resolve, reject) => {
    const request = database.transaction(draftStoreName, 'readonly').objectStore(draftStoreName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveDirectory = async (id: string, directory: FileSystemDirectoryHandle) => {
  const database = await openPickerDatabase();
  return new Promise<void>((resolve, reject) => {
    const request = database.transaction(pickerStoreName, 'readwrite').objectStore(pickerStoreName).put(directory, id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const hasDirectoryPermission = async (directory: FileSystemDirectoryHandle) => {
  const permissionDirectory = directory as PermissionDirectoryHandle;
  const permission = await permissionDirectory.queryPermission({ mode: 'read' });
  if (permission === 'granted') return true;
  if (permission === 'prompt') {
    return (await permissionDirectory.requestPermission({ mode: 'read' })) === 'granted';
  }
  return false;
};

const getFilePickerAcceptTypes = (accept: string): Record<string, string[]> => {
  if (accept === 'image/*') {
    return {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'],
    };
  }

  if (accept === 'video/*') {
    return {
      'video/*': ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v'],
    };
  }

  return {
    '*/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v'],
  };
};

const openRememberedFilePicker = async ({ id, accept }: FilePickerOptions) => {
  if (!('showOpenFilePicker' in window)) return null;

  const pickerWindow = window as PickerWindow;
  const directory = await loadDirectory(id);
  const pickerTypes: { description: string; accept: Record<string, string[]> }[] = [{
    description: accept === 'image/*' ? 'Images' : accept === 'video/*' ? 'Videos' : 'Files',
    accept: getFilePickerAcceptTypes(accept),
  }];

  const [fileHandle] = await pickerWindow.showOpenFilePicker({
    id,
    multiple: false,
    startIn: directory ?? undefined,
    types: pickerTypes,
  });

  return fileHandle ? fileHandle.getFile() : null;
};

export const CreateExamplePage = () => {
  const { exampleDraft, setExampleDraft, clearExampleDraft } = useDashboardStore();
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(exampleDraft.selectedCategoryId);

  const [videoPremium, setVideoPremium] = useState(exampleDraft.videoPremium);
  const [planType, setPlanType] = useState(exampleDraft.planType);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const questionImageInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  const [exampleName, setExampleName] = useState(exampleDraft.exampleName);
  const [questionImageFile, setQuestionImageFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);

  const [dynamicOptions, setDynamicOptions] = useState<OptionItem[]>(()=> { 
    if (exampleDraft.dynamicOptions?.length >= 2) {
    return exampleDraft.dynamicOptions;
   }
  return [
    { id: Math.random().toString(), text: '/أ', isCorrect: false },
    { id: Math.random().toString(), text: '/ب', isCorrect: false }, ]; });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Fetch Resources (Direct)
  useEffect(() => {
    async function load() {
        const { data: cats } = await supabaseClient
          .from('categories')
          .select('*')
          .eq('level', 3);
        if (cats) setCategories(cats);
    }
    load();
  }, []);

  useEffect(() => {
    void Promise.all([loadDraftFile('video'), loadDraftFile('question-image'), loadDraftFile('thumbnail')])
      .then(([video, questionImage, thumbnail]) => {
        if (video) setVideoFile(video);
        if (questionImage) setQuestionImageFile(questionImage);
        if (thumbnail) setThumbnailFile(thumbnail);
      });
  }, []);

  useEffect(() => {
    setExampleDraft({ selectedCategoryId, videoPremium, planType, exampleName, dynamicOptions });
  }, [selectedCategoryId, videoPremium, planType, exampleName, dynamicOptions, setExampleDraft]);

  useEffect(() => {
    const restoreDraft = (draft: typeof exampleDraft) => {
      setSelectedCategoryId(draft.selectedCategoryId);
      setVideoPremium(draft.videoPremium);
      setPlanType(draft.planType);
      setExampleName(draft.exampleName);
      setDynamicOptions(draft.dynamicOptions);
    };

    if (useDashboardStore.persist.hasHydrated()) {
      restoreDraft(useDashboardStore.getState().exampleDraft);
    }

    return useDashboardStore.persist.onFinishHydration((state) => {
      restoreDraft(state.exampleDraft);
    });
  }, []);

  const addOption = () => {
    setDynamicOptions([...dynamicOptions, { id: Math.random().toString(), text: '', isCorrect: false }]);
  };

  const removeOption = (id: string) => {
    setDynamicOptions(dynamicOptions.filter(opt => opt.id !== id));
  };

  const updateOptionText = (id: string, text: string) => {
    setDynamicOptions(dynamicOptions.map(opt => opt.id === id ? { ...opt, text } : opt));
  };

  const updateOptionCorrect = (id: string, isCorrect: boolean) => {
    setDynamicOptions(dynamicOptions.map(opt => opt.id === id ? { ...opt, isCorrect } : opt));
  };

  const uploadVideo = async () => {
    if (!videoFile) {
      throw new Error('يرجى اختيار ملف فيديو أولاً.');
    }

    const originalName = videoFile.name.replace(/[\\/]/g, '_').trim();
    const fileName = `${Date.now()}-${originalName}`;
    const filePath = fileName;

    const { error: uploadError } = await supabaseClient.storage
      .from('videos')
      .upload(filePath, videoFile, {
        cacheControl: '3600',
        upsert: false,
        contentType: videoFile.type,
      });

    if (uploadError) {
      throw new Error(`فشل رفع الفيديو: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabaseClient.storage
      .from('videos')
      .getPublicUrl(filePath);

    const { data: videoRecord, error: recordError } = await supabaseClient
      .from('videos')
      .insert([
        {
          video_url: publicUrl,
          is_premium: videoPremium,
          plan_type: planType,
        },
      ])
      .select()
      .single();

    if (recordError) {
      await supabaseClient.storage.from('videos').remove([filePath]);
      throw new Error(`تم رفع الملف لكن فشل حفظ سجل الفيديو: ${recordError.message}`);
    }

    return videoRecord.id as string;
  };

  const chooseVideo = async () => {
    if (!('showOpenFilePicker' in window)) {
      videoInputRef.current?.click();
      return;
    }

    try {
      const file = await openRememberedFilePicker({ id: 'example-video', accept: 'video/*' });
      setVideoFile(file);
      await saveDraftFile('video', file);
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') setMessage('تعذر فتح نافذة اختيار الفيديو.');
    }
  };

  const uploadQuestionImage = async (file: File) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabaseClient.storage
      .from('examplepictures')
      .upload(filePath, file);

    if (uploadError) {
      throw new Error(`فشل رفع صورة السؤال: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabaseClient.storage
      .from('examplepictures')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleQuestionImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setQuestionImageFile(file);
    await saveDraftFile('question-image', file);
  };

  const chooseQuestionImage = async () => {
    if (!('showOpenFilePicker' in window)) {
      questionImageInputRef.current?.click();
      return;
    }

    try {
      const file = await openRememberedFilePicker({ id: 'example-question-image', accept: 'image/*' });
      if (file) {
        setQuestionImageFile(file);
        await saveDraftFile('question-image', file);
      }
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') setMessage('تعذر فتح نافذة اختيار صورة السؤال.');
    }
  };

  const uploadThumbnail = async (file: File) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabaseClient.storage
      .from('thumbnails')
      .upload(filePath, file);

    if (uploadError) {
      throw new Error(`فشل رفع الصورة المصغرة: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabaseClient.storage
      .from('thumbnails')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleThumbnailUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setThumbnailFile(file);
    await saveDraftFile('thumbnail', file);
  };

  const chooseThumbnail = async () => {
    if (!('showOpenFilePicker' in window)) {
      thumbnailInputRef.current?.click();
      return;
    }

    try {
      const file = await openRememberedFilePicker({ id: 'example-thumbnail-image', accept: 'image/*' });
      if (file) {
        setThumbnailFile(file);
        await saveDraftFile('thumbnail', file);
      }
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') setMessage('تعذر فتح نافذة اختيار الصورة المصغرة.');
    }
  };

  const createExample = async () => {
    if (!selectedCategoryId) {
      setMessage('يرجى اختيار القسم أولاً.');
      return;
    }

    if (!videoFile || !questionImageFile) {
      setMessage('يرجى اختيار الفيديو وصورة السؤال أولاً.');
      return;
    }

    if (!exampleName.trim()) {
      setMessage('اسم المثال مطلوب.');
      return;
    }

    const validOptions = dynamicOptions.filter(opt => opt.text.trim() !== '');
    if (validOptions.length === 0) {
      setMessage('يرجى إضافة خيار واحد على الأقل.');
      return;
    }

    const optionsPayload: Record<string, boolean> = {};
    validOptions.forEach(opt => {
      optionsPayload[opt.text.trim()] = opt.isCorrect;
    });

    setSaving(true);
    setMessage('');

    try {
      setMessage('جاري رفع الفيديو...');
      const videoId = await uploadVideo();
      setMessage('جاري رفع الصور...');
      const questionImageUrl = await uploadQuestionImage(questionImageFile);
      const thumbnailUrl = thumbnailFile ? await uploadThumbnail(thumbnailFile) : null;

      const { data, error } = await supabaseClient
        .from('examples')
        .insert([{
          parent_category: selectedCategoryId,
          name: exampleName.trim(),
          question_image_url: questionImageUrl,
          video_id: videoId,
          options: optionsPayload,
          thumbnail: thumbnailUrl,
        }])
        .select()
        .single();

      if (error) throw new Error(error.message);

      setMessage(`تم إنشاء المثال بنجاح: ${data?.name ?? 'سجل جديد'}`);
      setSelectedCategoryId('');
      setExampleName('');
      setVideoPremium(true);
      setPlanType('firstbook_advance');
      setVideoFile(null);
      setQuestionImageFile(null);
      setThumbnailFile(null);
      setDynamicOptions([{ id: Math.random().toString(), text: '', isCorrect: false }]);
      clearExampleDraft();
      await Promise.all([
        saveDraftFile('video', null),
        saveDraftFile('question-image', null),
        saveDraftFile('thumbnail', null),
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'فشل إنشاء المثال.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="teacher-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">الأمثلة</p>
          <h1>إنشاء مثال</h1>
        </div>
        <Link to="/examples" className="ghost-button button-link">العودة للجدول</Link>
      </header>

      <form className="panel create-panel example-form" onSubmit={(event) => { event.preventDefault(); void createExample(); }}>
          <h2>بيانات المثال</h2>

          <label>
            القسم
            <select value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)} required>
              <option value="">اختر القسم</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>

          <label>
            اسم المثال
            <input value={exampleName} onChange={(event) => setExampleName(event.target.value)} placeholder="مثال: مراجعة الضرب" />
          </label>

          <label>
            نوع الوصول
            <select value={String(videoPremium)} onChange={(event) => setVideoPremium(event.target.value === 'true')}>
              <option value="true">مدفوع (Premium)</option>
              <option value="false">مجاني</option>
            </select>
          </label>

          <label>
            نوع الخطة
            <select value={planType} onChange={(event) => setPlanType(event.target.value)}>
              <option value="basicbook">أساسية</option>
              <option value="firstbook_advance">متخصصة كتاب أول</option>
              <option value="secondbook_advance">متخصصة كتاب ثاني</option>
            </select>
          </label>

          <label>
            صورة السؤال
            <input ref={questionImageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleQuestionImageUpload} />
            <button type="button" className="primary-button" onClick={chooseQuestionImage}>
              {questionImageFile ? `الصورة المختارة: ${questionImageFile.name}` : 'اختيار صورة السؤال'}
            </button>
          </label>

          <label>
            الصورة المصغرة (Thumbnail)
            <input ref={thumbnailInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleThumbnailUpload} />
            <button type="button" className="primary-button" onClick={chooseThumbnail}>
              {thumbnailFile ? `الصورة المختارة: ${thumbnailFile.name}` : 'اختيار الصورة المصغرة'}
            </button>
          </label>

          <label>
            ملف الفيديو
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setVideoFile(file);
                void saveDraftFile('video', file);
              }}
            />
            <button type="button" className="primary-button" onClick={chooseVideo}>
              {videoFile ? `الفيديو المختار: ${videoFile.name}` : 'اختيار الفيديو من الجهاز'}
            </button>
          </label>

          <div className="options-section">
            <h3 style={{ fontSize: '1rem', color: '#dfe7f5', marginBottom: '12px' }}>الخيارات (الإجابات)</h3>
            <div className="options-container">
              {dynamicOptions.map((opt) => (
                <div key={opt.id} className="option-item">
                  <input
                    type="text"
                    value={opt.text}
                    onChange={(e) => updateOptionText(opt.id, e.target.value)}
                    placeholder="نص الخيار"
                  />
                  <label>
                    <input
                      type="checkbox"
                      checked={opt.isCorrect}
                      onChange={(e) => updateOptionCorrect(opt.id, e.target.checked)}
                    />
                    صحيح
                  </label>
                  {dynamicOptions.length > 1 && (
                    <button type="button" className="remove-option-btn" onClick={() => removeOption(opt.id)}>حذف</button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className="add-option-btn" onClick={addOption}>+ إضافة خيار</button>
          </div>

          <button type="submit" className="primary-button" style={{ width: '100%', marginTop: '20px' }} disabled={saving}>
            {saving ? 'جاري رفع وإنشاء المثال...' : 'رفع المثال'}
          </button>

          {message && <div className="form-message">{message}</div>}
      </form>
    </div>
  );
};
