import { Refine } from '@refinedev/core'
import { RefineKbar, RefineKbarProvider } from '@refinedev/kbar'
import routerProvider, {
  DocumentTitleHandler,
  UnsavedChangesNotifier,
} from '@refinedev/react-router'
import { dataProvider, liveProvider } from '@refinedev/supabase'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router'
import { type FormEvent, useEffect, useMemo, useState } from 'react'

import { CreateExamplePage, ExampleList } from './pages/examples'
import { CategoryList, CreateCategoryPage } from './pages/categories'
import './App.css'

import authProvider from './providers/auth'
import { supabaseClient } from './providers/supabase-client'
import { useDashboardStore } from './store/dashboardStore'

type TableRow = Record<string, any>
type PaymentRow = TableRow & {
  id: string
  receipt_url?: string | null
  reason?: string | null
  status?: string | null
}

type ProfileRow = TableRow & {
  id?: string
  user_id?: string
  name?: string | null
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  username?: string | null
  email?: string | null
}

const verificationUrl = '/verify/storage'

const dashboardStats = [
  { label: 'الملفات الشخصية', value: '24', change: '+4 هذا الأسبوع' },
  { label: 'الفيديوهات', value: '86', change: '+12 هذا الشهر' },
  { label: 'الاشتراكات النشطة', value: '18', change: '+3 اليوم' },
  { label: 'المدفوعات المعلقة', value: '6', change: '2 عاجل' },
]

const allowedEmails = (import.meta.env.VITE_ALLOWED_EMAILS || 'you@example.com,admin@example.com')
  .split(',')
  .map((email: string) => email.trim().toLowerCase())
  .filter(Boolean)

function isAllowedEmail(email: string) {
  return allowedEmails.includes(email.trim().toLowerCase())
}

const resourceMeta = [
  { key: 'profiles', label: 'الملفات الشخصية', path: '/profiles', description: 'حسابات المستخدمين وتفاصيل المتعلمين', explanation: 'هذا القسم يتيح لك إدارة بيانات الطلاب وأدائهم.' },
  { key: 'categories', label: 'الأقسام', path: '/categories', description: 'المواضيع والمجموعات الأب والابن', explanation: 'استخدم هذا لتنظيم المنهج الدراسي في مستويات وأقسام منطقية.' },
  { key: 'videos', label: 'الفيديوهات', path: '/videos', description: 'محتوى الفيديو والوصول المتميز', explanation: 'إدارة جميع دروس الفيديو وتحديد أي منها يتطلب اشتراكاً مدفوعاً.' },
  { key: 'examples', label: 'الأمثلة', path: '/examples', description: 'أسئلة الممارسة وموارد الصور', explanation: 'إضافة وتعديل الأسئلة التفاعلية المرتبطة بالفيديوهات لتعزيز التعلم.' },
  { key: 'subscriptions', label: 'الاشتراكات', path: '/subscriptions', description: 'الخطط وتتبع الحالة', explanation: 'متابعة اشتراكات المستخدمين وتواريخ انتهاء الصلاحية.' },
  { key: 'payments', label: 'المدفوعات', path: '/payments', description: 'الإيصالات، التحقق، وحالة الفواتير', explanation: 'مراجعة وتأكيد عمليات الدفع التي قام بها الطلاب.' },
  { key: 'feedback', label: 'الملاحظات', path: '/feedback', explanation: 'رسائل المستخدمين والبيانات الوصفية', description: 'استقبال الردود والاستفسارات من الطلاب لتحسين الخدمة.' },
]

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => formatValue(item)).join(', ')
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return '[object Object]'
    }
  }
  return String(value)
}

function getProfileName(profile: ProfileRow): string | null {
  const fullName = profile.name ?? profile.full_name
  if (fullName) return fullName

  const firstAndLastName = [profile.first_name, profile.last_name].filter(Boolean).join(' ')
  return firstAndLastName || profile.username || profile.email || null
}

function useResourceRows(resource: string) {
  const [rows, setRows] = useState<TableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabaseClient.from(resource).select('*').limit(50)

      if (!active) return

      if (fetchError) {
        setError(fetchError.message)
        setRows([])
      } else {
        setRows(data ?? [])
      }

      setLoading(false)
    }

    load()

    return () => {
      active = false
    }
  }, [resource])

  return { rows, loading, error }
}

function DatabaseTablePage({
  resource,
  title,
  description,
  explanation,
}: {
  resource: string
  title: string
  description: string
  explanation?: string
}) {
  const { rows, loading, error } = useResourceRows(resource)

  const columns = useMemo(() => {
    const keys = new Set<string>()
    rows.forEach((row) => Object.keys(row).forEach((key) => keys.add(key)))
    return [...keys].slice(0, 6)
  }, [rows])

  return (
    <div className="teacher-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">قاعدة البيانات</p>
          <h1>{title}</h1>
        </div>
        {resource !== 'examples' && (
          <button className="primary-button">إضافة سجل</button>
        )}
      </header>

      <div className="panel description-panel">
        <h2>{description}</h2>
        {explanation && <p style={{ color: '#a5b4fc', marginBottom: '10px' }}>{explanation}</p>}
        <p>{rows.length} سجل تم استرجاعه من Supabase</p>
      </div>

      {loading ? (
        <div className="empty-state"><p>Loading records...</p></div>
      ) : error ? (
        <div className="empty-state"><h2>Connection issue</h2><p>{error}</p></div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <h2>No data yet</h2>
          <p>Connect this page to your table and insert rows in Supabase to see them here.</p>
        </div>
      ) : (
        <div className="table-card large-table">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${resource}-${index}`}>
                  {columns.map((column) => (
                    <td key={`${resource}-${column}-${index}`}>{formatValue(row[column])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

type DatabaseVideo = {
  id: string
  video_url: string
  is_premium?: boolean | null
  plan_type?: string | null
}

function VideosPage() {
  const [videos, setVideos] = useState<DatabaseVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadVideos() {
      setLoading(true)
      setError(null)

      const { data, error: listError } = await supabaseClient
        .from('videos')
        .select('id, video_url, is_premium, plan_type')
        .order('id', { ascending: false })
        .limit(100)

      if (listError) {
        setError(listError.message)
      } else {
        setVideos((data ?? []) as DatabaseVideo[])
      }

      setLoading(false)
    }

    loadVideos()
  }, [])

  return (
    <div className="teacher-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">التخزين</p>
          <h1>الفيديوهات المرفوعة</h1>
        </div>
        <Link to="/examples/create" className="primary-button button-link">رفع فيديو</Link>
      </header>

      <div className="panel description-panel">
        <h2>محتويات بوكيه الفيديوهات</h2>
        <p>{videos.length} فيديو مرفوع</p>
      </div>

      {loading ? (
        <div className="empty-state"><p>جاري تحميل الفيديوهات...</p></div>
      ) : error ? (
        <div className="empty-state"><h2>مشكلة في الاتصال</h2><p>{error}</p></div>
      ) : videos.length === 0 ? (
        <div className="empty-state"><h2>لا توجد فيديوهات</h2><p>ارفع فيديو جديداً ليظهر هنا.</p></div>
      ) : (
        <div className="table-card large-table">
          <table>
            <thead>
              <tr><th>الرابط</th><th>نوع الوصول</th><th>نوع الخطة</th></tr>
            </thead>
            <tbody>
              {videos.map((video) => {
                return (
                  <tr key={video.id}>
                    <td><a className="receipt-link" href={video.video_url} target="_blank" rel="noreferrer">فتح الفيديو</a></td>
                    <td>{video.is_premium ? 'مدفوع' : 'مجاني'}</td>
                    <td>{video.plan_type ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PaymentsPage() {
  const { rows, loading, error } = useResourceRows('payments')
  const { rows: profileRows } = useResourceRows('profiles')
  const [actionState, setActionState] = useState<Record<string, 'verifying' | 'retrying'>>({})
  const [actionError, setActionError] = useState<Record<string, string>>({})
  const [reasonValues, setReasonValues] = useState<Record<string, string>>({})

  const payments = rows as PaymentRow[]
  const profileNames = useMemo(() => {
    const names = new Map<string, string>()

    ;(profileRows as ProfileRow[]).forEach((profile) => {
      const name = getProfileName(profile)
      if (!name) return

      if (profile.id) names.set(profile.id, name)
      if (profile.user_id) names.set(profile.user_id, name)
    })

    return names
  }, [profileRows])

  useEffect(() => {
    setReasonValues(Object.fromEntries(payments.map((payment) => [payment.id, payment.reason ?? ''])))
  }, [payments])

  const columns = useMemo(() => {
    const preferredColumns = ['id', 'user_id', 'receipt_url', 'status', 'verified_at', 'created_at']
    const availableColumns = new Set<string>()

    payments.forEach((payment) => Object.keys(payment).forEach((key) => availableColumns.add(key)))

    return preferredColumns.filter((column) => availableColumns.has(column)).slice(0, 6)
  }, [payments])

  const getPaymentValue = (payment: PaymentRow, column: string) => {
    if (column === 'user_id') {
      return profileNames.get(payment.user_id) ?? payment.user_id
    }

    return payment[column]
  }

  const setPaymentAction = async (payment: PaymentRow, action: 'verifying' | 'retrying') => {
    setActionError((current) => ({ ...current, [payment.id]: '' }))
    setActionState((current) => ({ ...current, [payment.id]: action }))

    try {
      if (action === 'verifying') {
        const { error: updateError } = await supabaseClient
          .from('payments')
          .update({
            status: 'verified',
            verified_at: new Date().toISOString(),
            reason: reasonValues[payment.id] || null,
          })
          .eq('id', payment.id)

        if (updateError) throw updateError
      } else {
        if (!payment.receipt_url) throw new Error('This payment has no receipt URL.')

        const verificationResponse = await fetch(verificationUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payment_id: payment.id,
            image_url: payment.receipt_url,
          }),
        })

        if (!verificationResponse.ok) {
          const responseText = await verificationResponse.text()
          throw new Error(responseText || `Verification request failed (${verificationResponse.status}).`)
        }
      }

      window.location.reload()
    } catch (actionErrorValue) {
      setActionError((current) => ({
        ...current,
        [payment.id]: actionErrorValue instanceof Error ? actionErrorValue.message : 'Unable to complete this action.',
      }))
    } finally {
      setActionState((current) => {
        const next = { ...current }
        delete next[payment.id]
        return next
      })
    }
  }

  return (
    <div className="teacher-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">قاعدة البيانات</p>
          <h1>المدفوعات</h1>
        </div>
      </header>

      <div className="panel description-panel">
        <h2>الإيصالات، التحقق، وحالة الفواتير</h2>
        <p>{payments.length} سجل تم استرجاعه من Supabase</p>
      </div>

      {loading ? (
        <div className="empty-state"><p>Loading records...</p></div>
      ) : error ? (
        <div className="empty-state"><h2>Connection issue</h2><p>{error}</p></div>
      ) : payments.length === 0 ? (
        <div className="empty-state"><h2>No payments yet</h2></div>
      ) : (
        <div className="table-card large-table">
          <table>
            <thead>
              <tr>
                {columns.map((column) => <th key={column}>{column === 'user_id' ? 'name' : column}</th>)}
                <th>actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => {
                const currentAction = actionState[payment.id]
                const paymentError = actionError[payment.id]

                return (
                  <tr key={payment.id}>
                    {columns.map((column) => (
                      <td key={`${payment.id}-${column}`}>
                        {column === 'receipt_url' && payment.receipt_url ? (
                          <a href={payment.receipt_url} target="_blank" rel="noreferrer" className="receipt-link">
                            View receipt
                          </a>
                        ) : (
                          formatValue(getPaymentValue(payment, column))
                        )}
                      </td>
                    ))}
                    <td>
                      <div className="payment-actions">
                        <input
                          className="payment-reason-input"
                          type="text"
                          value={reasonValues[payment.id] ?? ''}
                          placeholder="Reason"
                          onChange={(event) => setReasonValues((current) => ({
                            ...current,
                            [payment.id]: event.target.value,
                          }))}
                        />
                        <button
                          className="table-action-button"
                          type="button"
                          disabled={Boolean(currentAction)}
                          onClick={() => void setPaymentAction(payment, 'verifying')}
                        >
                          {currentAction === 'verifying' ? 'Updating...' : 'Mark verified'}
                        </button>
                        <button
                          className="table-action-button secondary"
                          type="button"
                          disabled={Boolean(currentAction) || !payment.receipt_url}
                          onClick={() => void setPaymentAction(payment, 'retrying')}
                        >
                          {currentAction === 'retrying' ? 'Sending...' : 'Retry verification'}
                        </button>
                      </div>
                      {paymentError && <span className="payment-action-error">{paymentError}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TeacherDashboard() {
  return (
    <div className="teacher-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">مساحة عمل المعلم</p>
          <h1>لوحة التحكم</h1>
        </div>
        <button className="primary-button">محتوى جديد</button>
      </header>

      <section className="stats-grid">
        {dashboardStats.map((item) => (
          <article key={item.label} className="stat-card">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.change}</small>
          </article>
        ))}
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-header">
            <h2>سير التعلم</h2>
            <button className="ghost-button">نظرة عامة</button>
          </div>
          <ul className="list-stack">
            <li>
              <div>
                <strong>أقسام الدورة</strong>
                <span>تنظيم المنهج حسب المستوى</span>
              </div>
              <time>جاهز</time>
            </li>
            <li>
              <div>
                <strong>مكتبة الفيديو</strong>
                <span>المحتوى المتميز والعام</span>
              </div>
              <time>مباشر</time>
            </li>
            <li>
              <div>
                <strong>أمثلة الممارسة</strong>
                <span>أسئلة مرتبطة بالفيديوهات</span>
              </div>
              <time>مسودة</time>
            </li>
          </ul>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>نظرة عامة على المخطط</h2>
            <button className="ghost-button">تحديث</button>
          </div>
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>القسم</th>
                  <th>الغرض</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {resourceMeta.map((item) => (
                  <tr key={item.key}>
                    <td>{item.label}</td>
                    <td>{item.description}</td>
                    <td><span className="status-badge">نشط</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  )
}

function Shell() {
  const { setActiveTab } = useDashboardStore();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setActiveTab(location.pathname);
  }, [location, setActiveTab]);

  const handleLogout = async () => {
    const { error } = await supabaseClient.auth.signOut();

    if (!error) {
      navigate('/login', { replace: true });
    }
  }

  const navItems = [
    { label: 'لوحة التحكم', to: '/' },
    ...resourceMeta.map((item) => ({ label: item.label, to: item.path })),
    { label: 'إنشاء مثال', to: '/examples/create' },
  ]

  return (
    <div className="teacher-shell">
      <aside className="sidebar">
        <div className="brand">إدارة التعليم</div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/examples'} className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button className="logout-button" onClick={handleLogout} type="button">تسجيل الخروج</button>
      </aside>

      <main className="main-panel">
        <Routes>
          <Route index element={<TeacherDashboard />} />
          {resourceMeta.map((item) => (
            <Route
              key={item.key}
              path={item.path}
              element={
                item.key === 'examples' ? (
                  <ExampleList />
                ) : item.key === 'categories' ? (
                  <CategoryList />
                ) : item.key === 'payments' ? (
                  <PaymentsPage />
                ) : item.key === 'videos' ? (
                  <VideosPage />
                ) : (
                  <DatabaseTablePage resource={item.key} title={item.label} description={item.description} explanation={item.explanation} />
                )
              }
            />
          ))}
          <Route path="/examples/create" element={<CreateExamplePage />} />
          <Route path="/categories/create" element={<CreateCategoryPage />} />
        </Routes>
      </main>
    </div>
  )
}

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabaseClient.auth.getSession();

      if (data.session) {
        navigate('/', { replace: true });
      }
    };

    checkUser();
  }, [navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password.trim()) {
      setError('يرجى إدخال البريد الإلكتروني وكلمة المرور.');
      return;
    }

    if (!isAllowedEmail(normalizedEmail)) {
      setError('هذا الحساب غير مسموح له بالدخول إلى لوحة الإدارة.');
      return;
    }

    setLoading(true);

    const { data, error: signInError } = await supabaseClient.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      navigate('/', { replace: true });
    }

    setLoading(false);
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <p className="eyebrow">إدارة التعليم</p>
        <h1>تسجيل الدخول</h1>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            البريد الإلكتروني
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          <label>
            كلمة المرور
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button className="primary-button login-button" type="submit" disabled={loading}>
            {loading ? 'جاري تسجيل الدخول...' : 'دخول'}
          </button>
        </form>
      </div>
    </div>
  )
}

function AppContent() {
  const [isReady, setIsReady] = useState(false);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    let ignore = false;

    const initializeSession = async () => {
      const { data } = await supabaseClient.auth.getSession();

      if (!ignore) {
        setSession(data.session);
        setIsReady(true);
      }
    };

    const { data: authListener } = supabaseClient.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    initializeSession();

    return () => {
      ignore = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

  if (!isReady) {
    return (
      <div className="login-screen">
        <div className="login-card loading-card">
          <p>جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  return <Shell />;
}

function App() {
  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <Refine
          dataProvider={dataProvider(supabaseClient)}
          liveProvider={liveProvider(supabaseClient)}
          authProvider={authProvider}
          routerProvider={routerProvider}
          options={{
            syncWithLocation: true,
            warnWhenUnsavedChanges: true,
          }}
        >
          <AppContent />
          <RefineKbar />
          <UnsavedChangesNotifier />
          <DocumentTitleHandler />
        </Refine>
      </RefineKbarProvider>
    </BrowserRouter>
  )
}

export default App