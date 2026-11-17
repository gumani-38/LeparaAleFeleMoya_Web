import { FormEvent, ReactNode, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { apiErrorMessage } from '../../../shared/api-client'
import { ADMIN_LIST_PAGE_SIZE, AdminDashboardResponse, AdminDonationPledge, AdminInitiative, AdminInitiativeTask, AdminInitiativeType, AdminOrder, AdminOrderStatus, AdminProduct, AdminProductCategory, AdminProductVariant, AdminRequester, AdminVolunteerApplication, adminApi } from './api'
import { useAdminAuth } from './AuthContext'

const navItems = [
  { label: 'Overview', path: '/overview' },
  { label: 'Products', path: '/products' },
  { label: 'Orders', path: '/orders' },
  { label: 'Donations', path: '/donations' },
  { label: 'Volunteers', path: '/volunteers' },
  { label: 'To-do Tasks', path: '/tasks' },
  { label: 'Events', path: '/events' },
]

function App() {
  const { admin, isLoading, request, signOut, backupCodes } = useAdminAuth()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [dashboard, setDashboard] = useState<AdminDashboardResponse | null>(null)
  const [orders, setOrders] = useState<AdminOrder[] | null>(null)
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    if (!admin) return
    setDashboard(null)
    setOrders(null)
    setDashboardError(null)
    setOrdersError(null)

    adminApi.getDashboard(request)
      .then((result) => { if (!ignore) setDashboard(result) })
      .catch((error: Error) => { if (!ignore) setDashboardError(error.message) })
    adminApi.getOrders(request)
      .then((result) => { if (!ignore) setOrders(result) })
      .catch((error: Error) => { if (!ignore) setOrdersError(error.message) })

    return () => {
      ignore = true
    }
  }, [admin, request])

  if (isLoading) {
    return <StandaloneState title="Checking admin session..." description="Connecting to the Lepara API." />
  }
  if (!admin) {
    return <AdminLoginPage />
  }
  if (admin.mustChangePassword) {
    return <AdminPasswordChangePage />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="sidebar-topline">
            <div className="brand">Lepara Ale Fele Moya</div>
            <button
              aria-controls="admin-navigation"
              aria-expanded={mobileNavOpen}
              aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="mobile-menu-button"
              onClick={() => setMobileNavOpen((isOpen) => !isOpen)}
              type="button"
            >
              <span />
              <span />
              <span />
            </button>
          </div>
          <div className="sidebar-label">Administration</div>
          <nav className={`nav-list${mobileNavOpen ? ' is-open' : ''}`} id="admin-navigation">
            {navItems.map((item) => (
              <NavLink key={item.path} to={item.path} onClick={() => setMobileNavOpen(false)} className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="sidebar-footer">
          <a className="sidebar-aux" href="#public">View public website</a>
          <div className="sidebar-status">Live API · {admin.role.replace('_', ' ')}</div>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div className="breadcrumbs">Workspace / Admin</div>
          <div className="user-chip"><span>{admin.fullName}</span><button className="text-button" type="button" onClick={() => { void signOut().catch((error: Error) => setSignOutError(error.message)) }}>Sign out</button></div>
        </header>

        <section className="workspace-page">
          {signOutError ? <p role="alert">{signOutError}</p> : null}
          {backupCodes.length > 0 ? <div className="card backup-codes"><h2>Save your backup codes</h2><p>These are shown once. Store them somewhere safe.</p><p>{backupCodes.join(' · ')}</p></div> : null}
          <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={dashboard && orders ? <OverviewPage dashboard={dashboard} orders={orders} request={request} /> : <StandaloneState title={dashboardError || ordersError ? 'Unable to load dashboard data.' : 'Loading dashboard...'} description={dashboardError ?? ordersError ?? 'Fetching dashboard and order data from the API.'} />} />
            <Route path="/products" element={<ProductsPage request={request} />} />
            <Route path="/orders" element={orders ? <OrdersPage orders={orders} request={request} onOrderUpdated={(updatedOrder) => setOrders((current) => current?.map((order) => order.orderId === updatedOrder.orderId ? updatedOrder : order) ?? null)} /> : <StandaloneState title={ordersError ? 'Unable to load orders.' : 'Loading orders...'} description={ordersError ?? 'Fetching order data from the API.'} />} />
            <Route path="/donations" element={<DonationPledgesPage request={request} />} />
            <Route path="/volunteers" element={<VolunteerApplicationsPage request={request} />} />
            <Route path="/tasks" element={<TasksPage request={request} />} />
            <Route path="/events" element={<EventsPage request={request} />} />
          </Routes>
        </section>
      </main>
    </div>
  )
}

type ProductDraft = {
  categoryId: string
  name: string
  price: string
  colour: string
  material: string
  description: string
  isActive: boolean
  variantSize: string
  variantSku: string
  variantStock: string
}

const emptyProductDraft: ProductDraft = {
  categoryId: '',
  name: '',
  price: '',
  colour: '',
  material: '',
  description: '',
  isActive: false,
  variantSize: '',
  variantSku: '',
  variantStock: '0',
}

function ProductsPage({ request }: { request: AdminRequester }) {
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [categories, setCategories] = useState<AdminProductCategory[]>([])
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState<ProductDraft>(emptyProductDraft)
  const [variantRows, setVariantRows] = useState<AdminProductVariant[]>([])
  const [image, setImage] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  async function refreshProducts() {
    setProducts(await adminApi.getProducts(request))
  }

  useEffect(() => {
    let ignore = false
    adminApi.getProducts(request)
      .then((result) => { if (!ignore) setProducts(result) })
      .catch((requestError: Error) => { if (!ignore) setError(requestError.message) })
      .finally(() => { if (!ignore) setIsLoading(false) })
    adminApi.getProductCategories(request)
      .then((result) => { if (!ignore) setCategories(result) })
      .catch((requestError: Error) => { if (!ignore) setError(requestError.message) })
    return () => { ignore = true }
  }, [request])

  function startCreate() {
    setEditingProduct(null)
    setEditorOpen(true)
    setDraft(emptyProductDraft)
    setVariantRows([])
    setImage(null)
    setError(null)
    setMessage(null)
  }

  async function startEdit(productId: number) {
    setError(null)
    setMessage(null)
    try {
      const product = await adminApi.getProduct(request, productId)
      setEditingProduct(product)
      setEditorOpen(true)
      setDraft({
        categoryId: String(product.categoryId),
        name: product.name,
        price: String(product.priceCents / 100),
        colour: product.colour ?? '',
        material: product.material ?? '',
        description: product.description ?? '',
        isActive: product.isActive,
        variantSize: '',
        variantSku: '',
        variantStock: '0',
      })
      setVariantRows(product.variants)
      setImage(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load product details.')
    }
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setIsSaving(true)
    const body = {
      categoryId: Number(draft.categoryId),
      name: draft.name.trim(),
      price: draft.price,
      colour: draft.colour.trim() || null,
      material: draft.material.trim() || null,
      description: draft.description.trim() || null,
      isActive: draft.isActive,
    }
    try {
      let saved: AdminProduct
      if (editingProduct) {
        saved = await adminApi.updateProduct(request, editingProduct.productId, body)
      } else {
        const variants = draft.variantSize
          ? [{ size: draft.variantSize, sku: draft.variantSku.trim(), quantityOnHand: Number(draft.variantStock) }]
          : []
        saved = await adminApi.createProduct(request, { ...body, variants })
      }
      setEditingProduct(saved)
      setEditorOpen(true)
      setVariantRows(saved.variants)
      if (image) saved = await adminApi.uploadProductImage(request, saved.productId, image)
      await refreshProducts()
      setEditingProduct(null)
      setEditorOpen(false)
      setMessage(`${saved.name} saved successfully.`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save product.')
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleProduct(product: AdminProduct) {
    setError(null)
    setMessage(null)
    if (product.isActive && !window.confirm(`Hide "${product.name}" from the shop? You can show it again later.`)) return
    try {
      await adminApi.updateProduct(request, product.productId, { isActive: !product.isActive })
      await refreshProducts()
      setMessage(product.isActive ? `${product.name} is now hidden from the shop.` : `${product.name} is now visible in the shop.`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update product visibility.')
    }
  }

  async function addVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingProduct) return
    const form = event.currentTarget
    setError(null)
    const values = new FormData(form)
    try {
      await adminApi.createProductVariant(request, editingProduct.productId, {
        size: String(values.get('size') ?? ''),
        sku: String(values.get('sku') ?? ''),
        quantityOnHand: Number(values.get('quantityOnHand') ?? 0),
      })
      const updated = await adminApi.getProduct(request, editingProduct.productId)
      setEditingProduct(updated)
      setVariantRows(updated.variants)
      await refreshProducts()
      form.reset()
      setMessage('Size and stock added.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to add size.')
    }
  }

  async function saveVariant(event: FormEvent<HTMLFormElement>, variant: AdminProductVariant) {
    event.preventDefault()
    if (!editingProduct) return
    const values = new FormData(event.currentTarget)
    setError(null)
    try {
      await adminApi.updateProductVariant(request, editingProduct.productId, variant.variantId, {
        sku: String(values.get('sku') ?? '').trim(),
        quantityOnHand: Number(values.get('quantityOnHand') ?? 0),
      })
      const updated = await adminApi.getProduct(request, editingProduct.productId)
      setEditingProduct(updated)
      setVariantRows(updated.variants)
      await refreshProducts()
      setMessage(`${variant.size} stock updated.`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update stock.')
    }
  }

  return (
    <PageFrame title="The collection." description="Create, update, photograph and manage products and stock from the shop API." buttonLabel="Products">
      <div className="management-toolbar">
        <p className="muted-copy">{products.length} products in the catalogue. Archiving hides a product from the shop while keeping its order history.</p>
        <button className="primary-button" type="button" onClick={startCreate} disabled={categories.length === 0}>+ Add product</button>
      </div>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {message ? <p className="success-message" role="status">{message}</p> : null}
      {editorOpen ? (
        <Card title={editingProduct ? `Edit ${editingProduct.name}` : 'Create a product'}>
          <form className="management-form" onSubmit={saveProduct}>
            <div className="form-grid">
              <label>Product name<input value={draft.name} minLength={2} maxLength={120} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
              <label>Category<select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })} required><option value="">Choose category</option>{categories.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.name}</option>)}</select></label>
              <label>Price (R)<input type="number" min="0.01" max="100000" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} required /></label>
              <label>Colour<input value={draft.colour} minLength={2} maxLength={40} onChange={(event) => setDraft({ ...draft, colour: event.target.value })} /></label>
              <label>Material<input value={draft.material} minLength={2} maxLength={60} onChange={(event) => setDraft({ ...draft, material: event.target.value })} /></label>
              <label>Product photo (JPEG, PNG, WebP; max 2 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] ?? null)} /></label>
              <label className="wide-field">Description<textarea value={draft.description} minLength={10} maxLength={2000} rows={4} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
              <label className="check-field"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} /> Show in shop</label>
            </div>
            {!editingProduct ? (
              <fieldset className="management-fieldset">
                <legend>Initial size (optional)</legend>
                <div className="form-grid">
                  <label>Size<select value={draft.variantSize} onChange={(event) => setDraft({ ...draft, variantSize: event.target.value })}><option value="">Add sizes later</option>{['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One size'].map((size) => <option key={size}>{size}</option>)}</select></label>
                  {draft.variantSize ? <><label>SKU<input value={draft.variantSku} onChange={(event) => setDraft({ ...draft, variantSku: event.target.value })} minLength={2} maxLength={40} required /></label><label>Stock on hand<input type="number" value={draft.variantStock} onChange={(event) => setDraft({ ...draft, variantStock: event.target.value })} min={0} max={100000} required /></label></> : null}
                </div>
              </fieldset>
            ) : null}
            <div className="button-row"><button className="primary-button" disabled={isSaving} type="submit">{isSaving ? 'Saving...' : editingProduct ? 'Save changes' : 'Create product'}</button><button className="secondary-button" type="button" onClick={() => { setEditingProduct(null); setEditorOpen(false) }}>Cancel</button></div>
          </form>
          {editingProduct ? (
            <div className="variant-management">
              <h3>Sizes and stock</h3>
              {variantRows.length ? variantRows.map((variant) => (
                <form className="variant-edit-row" key={variant.variantId} onSubmit={(event) => void saveVariant(event, variant)}>
                  <strong>{variant.size}</strong>
                  <label>SKU<input name="sku" defaultValue={variant.sku} minLength={2} maxLength={40} required /></label>
                  <label>Stock<input name="quantityOnHand" type="number" defaultValue={variant.quantityOnHand} min={0} max={100000} required /></label>
                  <button className="secondary-button" type="submit">Save</button>
                </form>
              )) : <p className="muted-copy">No sizes yet. Add a variant below.</p>}
              <form className="variant-edit-row" onSubmit={(event) => void addVariant(event)}>
                <strong>New size</strong>
                <label>Size<select name="size" required defaultValue=""><option value="">Choose size</option>{['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One size'].filter((size) => !variantRows.some((variant) => variant.size === size)).map((size) => <option key={size}>{size}</option>)}</select></label>
                <label>SKU<input name="sku" minLength={2} maxLength={40} required /></label>
                <label>Stock<input name="quantityOnHand" type="number" min={0} max={100000} defaultValue={0} required /></label>
                <button className="secondary-button" type="submit">Add size</button>
              </form>
            </div>
          ) : null}
        </Card>
      ) : null}
      <Card title="Products">
        {isLoading ? <p>Loading products...</p> : products.length === 0 ? <p>No products found in the catalogue yet.</p> : <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Product</th><th>Price</th><th>Sizes</th><th>Stock</th><th>Visibility</th><th>Manage</th></tr></thead>
            <tbody>{products.map((product) => (
              <tr key={product.productId}>
                <td><strong>{product.name}</strong><div className="muted-copy">{product.categoryName} · {product.subtitle}</div></td>
                <td>{product.price}</td>
                <td>{product.sizes.join(', ') || 'No sizes'}</td>
                <td>{product.totalStock}</td>
                <td><span className={`tag${product.isActive ? '' : ' tag-muted'}`}>{product.isActive ? 'Active' : 'Hidden'}</span></td>
                <td><div className="row-controls"><button className="table-action" type="button" onClick={() => void startEdit(product.productId)}>Edit</button><button className="table-action" type="button" onClick={() => void toggleProduct(product)}>{product.isActive ? 'Hide' : 'Show'}</button></div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
      </Card>
    </PageFrame>
  )
}

type InitiativeDraft = {
  typeId: string
  title: string
  summary: string
  description: string
  location: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  donationNeeds: string
  volunteersRequired: boolean
}

const emptyInitiativeDraft: InitiativeDraft = {
  typeId: '',
  title: '',
  summary: '',
  description: '',
  location: '',
  startDate: '',
  endDate: '',
  startTime: '',
  endTime: '',
  donationNeeds: '',
  volunteersRequired: false,
}

function EventsPage({ request }: { request: AdminRequester }) {
  const [events, setEvents] = useState<AdminInitiative[]>([])
  const [types, setTypes] = useState<AdminInitiativeType[]>([])
  const [editing, setEditing] = useState<AdminInitiative | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState<InitiativeDraft>(emptyInitiativeDraft)
  const [image, setImage] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  async function refreshEvents() {
    setEvents(await adminApi.getInitiatives(request))
  }

  useEffect(() => {
    let ignore = false
    Promise.all([adminApi.getInitiatives(request), adminApi.getInitiativeTypes(request)])
      .then(([eventResult, typeResult]) => {
        if (!ignore) {
          setEvents(eventResult)
          setTypes(typeResult)
          setError(null)
        }
      })
      .catch((requestError: Error) => { if (!ignore) setError(requestError.message) })
      .finally(() => { if (!ignore) setIsLoading(false) })
    return () => { ignore = true }
  }, [request])

  function startNew() {
    setEditing(null)
    setEditorOpen(true)
    setDraft(emptyInitiativeDraft)
    setImage(null)
    setError(null)
    setMessage(null)
  }

  async function startEdit(id: number) {
    setError(null)
    try {
      const event = await adminApi.getInitiative(request, id)
      setEditing(event)
      setEditorOpen(true)
      setDraft({
        typeId: String(event.typeId),
        title: event.title,
        summary: event.summary ?? '',
        description: event.description,
        location: event.location ?? '',
        startDate: event.startDate.slice(0, 10),
        endDate: event.endDate.slice(0, 10),
        startTime: event.startTime ?? '',
        endTime: event.endTime ?? '',
        donationNeeds: event.donationNeeds ?? '',
        volunteersRequired: event.volunteersRequired,
      })
      setImage(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load event details.')
    }
  }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setIsSaving(true)
    const body = {
      typeId: Number(draft.typeId),
      title: draft.title.trim(),
      summary: draft.summary.trim() || null,
      description: draft.description.trim(),
      location: draft.location.trim() || null,
      startDate: draft.startDate,
      endDate: draft.endDate,
      startTime: draft.startTime || null,
      endTime: draft.endTime || null,
      donationNeeds: draft.donationNeeds.trim() || null,
      volunteersRequired: draft.volunteersRequired,
    }
    try {
      let saved = editing
        ? await adminApi.updateInitiative(request, editing.initiativeId, body)
        : await adminApi.createInitiative(request, body)
      setEditing(saved)
      setEditorOpen(true)
      if (image) saved = await adminApi.uploadInitiativeImage(request, saved.initiativeId, image)
      await refreshEvents()
      setEditing(null)
      setEditorOpen(false)
      setMessage(`“${saved.title}” saved as ${saved.status}.`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save event.')
    } finally {
      setIsSaving(false)
    }
  }

  async function changeStatus(event: AdminInitiative, status: AdminInitiative['status']) {
    setError(null)
    setMessage(null)
    if (status === 'Published') {
      const blockers: string[] = []
      const todayInSouthAfrica = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Johannesburg',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date())
      if (event.startDate.slice(0, 10) <= todayInSouthAfrica) {
        blockers.push('set a start date in the future')
      }
      if (event.volunteersRequired && event.taskCount === 0) {
        blockers.push('add at least one volunteer task')
      }
      if (blockers.length > 0) {
        setError(`Cannot publish “${event.title}”: ${blockers.join(' and ')}.`)
        return
      }
    }
    try {
      await adminApi.updateInitiativeStatus(request, event.initiativeId, status)
      await refreshEvents()
      setMessage(`“${event.title}” is now ${status}.`)
    } catch (requestError) {
      setError(apiErrorMessage(requestError, 'Unable to change event status.'))
    }
  }

  return (
    <PageFrame title="Make space for community." description="Create events, upload photos, edit details and manage draft-to-published status." buttonLabel="Events">
      <div className="management-toolbar"><p className="muted-copy">{events.length} initiatives from the API.</p><button className="primary-button" type="button" onClick={startNew}>+ Create event</button></div>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {message ? <p className="success-message" role="status">{message}</p> : null}
      {editorOpen ? (
        <Card title={editing ? `Edit ${editing.title}` : 'Create an event'}>
          <form className="management-form" onSubmit={saveEvent}>
            <div className="form-grid">
              <label>Event title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} minLength={3} maxLength={200} required /></label>
              <label>Event type<select value={draft.typeId} onChange={(event) => setDraft({ ...draft, typeId: event.target.value })} required><option value="">Choose type</option>{types.map((type) => <option key={type.typeId} value={type.typeId}>{type.name}</option>)}</select></label>
              <label>Start date<input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} required /></label>
              <label>End date<input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} min={draft.startDate} required /></label>
              <label>Start time<input type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} /></label>
              <label>End time<input type="time" value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} /></label>
              <label>Location<input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} minLength={3} maxLength={200} /></label>
              <label>Donation needs<input value={draft.donationNeeds} onChange={(event) => setDraft({ ...draft, donationNeeds: event.target.value })} maxLength={255} /></label>
              <label className="wide-field">Short summary<textarea value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} minLength={10} maxLength={200} rows={2} /></label>
              <label className="wide-field">Description<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} minLength={20} maxLength={5000} rows={5} required /></label>
              <label>Event photo (JPEG, PNG, WebP; max 2 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] ?? null)} /></label>
              <label className="check-field"><input type="checkbox" checked={draft.volunteersRequired} onChange={(event) => setDraft({ ...draft, volunteersRequired: event.target.checked })} /> Volunteers needed</label>
            </div>
            <div className="button-row"><button className="primary-button" disabled={isSaving || editing?.status === 'Closed'} type="submit">{isSaving ? 'Saving...' : editing ? 'Save changes' : 'Create draft'}</button><button className="secondary-button" type="button" onClick={() => { setEditing(null); setEditorOpen(false) }}>Cancel</button></div>
            {editing?.status === 'Closed' ? <p className="muted-copy">Closed events are records and cannot be edited by the API.</p> : null}
          </form>
        </Card>
      ) : null}
      <Card title="Events and initiatives">
        {isLoading ? <p>Loading events...</p> : events.length === 0 ? <p>No events have been created yet.</p> : (
          <div className="data-table-wrap">
            <table className="data-table"><thead><tr><th>Event</th><th>Type</th><th>Dates</th><th>Status</th><th>Tasks / Volunteers</th><th>Manage</th></tr></thead>
              <tbody>{events.map((event) => (
                <tr key={event.initiativeId}>
                  <td><strong>{event.title}</strong><div className="muted-copy">{event.location ?? 'Location to be confirmed'}</div></td>
                  <td>{event.typeName}</td>
                  <td>{event.startDate.slice(0, 10)}{event.endDate.slice(0, 10) !== event.startDate.slice(0, 10) ? ` – ${event.endDate.slice(0, 10)}` : ''}</td>
                  <td><span className={`tag${event.status === 'Published' ? ' tag-dark' : ' tag-muted'}`}>{event.status}</span></td>
                  <td>{event.taskCount} tasks / {event.applicationCount} applications</td>
                  <td><div className="row-controls"><button className="table-action" type="button" onClick={() => void startEdit(event.initiativeId)} disabled={event.status === 'Closed'}>Edit</button>{event.status === 'Draft' ? <button className="table-action" type="button" onClick={() => void changeStatus(event, 'Published')}>Publish</button> : event.status === 'Published' ? <button className="table-action" type="button" onClick={() => void changeStatus(event, 'Closed')}>Close</button> : null}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </PageFrame>
  )
}

function AdminLoginPage() {
  const { login, verifyCode, pendingToken, nextStep, setupDetails, error: sessionError } = useAdminAuth()
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    const values = new FormData(event.currentTarget)
    try {
      await login(String(values.get('username') ?? '').trim(), String(values.get('password') ?? ''))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to sign in.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    const values = new FormData(event.currentTarget)
    try {
      await verifyCode(String(values.get('code') ?? '').trim())
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to verify your authenticator code.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <div className="eyebrow">Lepara Ale Fele Moya / administration</div>
        <h1>{pendingToken ? 'Verify your sign-in.' : 'Admin sign in.'}</h1>
        {pendingToken ? <p className="auth-intro">Use your authenticator app to continue.</p> : null}
        {!pendingToken ? (
          <form className="auth-form" onSubmit={handleLogin}>
            <label>Username<input name="username" type="text" autoComplete="username" maxLength={50} required /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" maxLength={128} required /></label>
            {error || sessionError ? <p className="auth-error" role="alert">{error ?? sessionError}</p> : null}
            <button className="primary-button" disabled={isSubmitting} type="submit">{isSubmitting ? 'Signing in...' : 'Continue'}</button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleVerify}>
            {nextStep === 'two_factor_setup' && setupDetails ? (
              <div className="auth-setup">
                <p>Scan this QR code with your authenticator app, then enter its six-digit code.</p>
                <img src={setupDetails.qrCodeDataUrl} alt="Authenticator setup QR code" />
                <p>Manual key: <code>{setupDetails.manualEntryKey}</code></p>
              </div>
            ) : null}
            <label>Authenticator or backup code<input name="code" type="text" autoComplete="one-time-code" inputMode="numeric" maxLength={12} required /></label>
            {error ? <p className="auth-error" role="alert">{error}</p> : null}
            <button className="primary-button" disabled={isSubmitting || (nextStep === 'two_factor_setup' && !setupDetails)} type="submit">
              {isSubmitting ? 'Verifying...' : nextStep === 'two_factor_setup' ? 'Confirm authenticator' : 'Verify and sign in'}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}

function AdminPasswordChangePage() {
  const { changePassword, signOut } = useAdminAuth()
  const [error, setError] = useState<string | null>(null)
  const [complete, setComplete] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    const values = new FormData(event.currentTarget)
    try {
      await changePassword(
        String(values.get('currentPassword') ?? ''),
        String(values.get('newPassword') ?? ''),
        String(values.get('confirmPassword') ?? ''),
      )
      setComplete(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to change the password.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (complete) {
    return (
      <div className="auth-shell">
        <section className="auth-card">
          <h1>Password updated.</h1>
          <p className="auth-intro">Your admin password was changed. Sign in again to open the dashboard.</p>
          <button className="primary-button" onClick={() => { void signOut() }} type="button">Return to sign in</button>
        </section>
      </div>
    )
  }

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <h1>Choose a new password.</h1>
        <p className="auth-intro">Change your temporary password before using the admin dashboard.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
          <label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
          <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="primary-button" disabled={isSubmitting} type="submit">{isSubmitting ? 'Updating...' : 'Update password'}</button>
        </form>
      </section>
    </div>
  )
}

function StandaloneState({ title, description }: { title: string; description: string }) {
  return (
    <div className="app-shell">
      <main className="workspace">
        <section className="workspace-page">
          <div className="page-frame">
            <div className="page-heading">
              <div>
                <h1>{title}</h1>
                <p>{description}</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function PageFrame({ title, description, children }: { title: string; description: string; buttonLabel: string; children: ReactNode }) {
  return (
    <div className="page-frame">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Admin website / live API data</div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <span className="tag tag-dark">Live data</span>
      </div>
      {children}
      <div className="page-footnote">Dashboard figures and records are loaded from the API.</div>
    </div>
  )
}

function OverviewPage({ dashboard, orders, request }: { dashboard: AdminDashboardResponse; orders: AdminOrder[]; request: AdminRequester }) {
  const metrics = [
    { label: 'Orders awaiting payment', value: dashboard.orders.awaitingPayment },
    { label: 'Orders to pack', value: dashboard.orders.toPack },
    { label: 'Volunteers to review', value: dashboard.volunteerApplications.waiting },
    { label: 'Upcoming initiatives', value: dashboard.initiatives.upcoming },
  ]
  return (
    <PageFrame title="A clear view of the work." description={`Dashboard live data · ${dashboard.today}`} buttonLabel="Dashboard">
      <div className="metric-grid">
        {metrics.map((metric) => (
          <Card key={metric.label} title={metric.label}>
            <div className="metric-value">{metric.value}</div>
            <div className="muted-copy">Current API total</div>
          </Card>
        ))}
      </div>
      <div className="two-column-overview">
        <div className="stacked-cards">
          <Card title="Attention needed">
            <div className="list-row"><span className="row-badge">Donations</span><span className="row-text">{dashboard.donationPledges.waiting} pledges waiting for review</span></div>
            <div className="list-row"><span className="row-badge">Assistance</span><span className="row-text">{dashboard.assistanceRequests.waitingForDecision} requests waiting for a decision</span></div>
            <div className="list-row"><span className="row-badge">Stock</span><span className="row-text">{dashboard.stock.lowItemCount} stock items need attention</span></div>
          </Card>
          <Card title="Recent orders">
            <DataTable columns={['Recent order', 'Customer', 'Total', 'Status']} rows={orders.slice(0, 5).map((order) => [order.orderNumber, order.customer.name, order.total, order.statusLabel])} />
          </Card>
        </div>
        <div className="stacked-cards aside-rail">
          <UpcomingTasksCard request={request} today={dashboard.today} />
        </div>
      </div>
    </PageFrame>
  )
}

function UpcomingTasksCard({ request, today }: { request: AdminRequester; today: string }) {
  const [tasks, setTasks] = useState<{ task: AdminInitiativeTask; initiative: AdminInitiative }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    setIsLoading(true)
    setError(null)
    adminApi.getInitiatives(request)
      .then(async (initiatives) => {
        const upcoming = initiatives
          .filter((initiative) => initiative.status !== 'Closed' && initiative.endDate >= today)
          .sort((left, right) => left.startDate.localeCompare(right.startDate))
          .slice(0, 5)
        const taskLists = await Promise.all(upcoming.map(async (initiative) => ({
          initiative,
          tasks: await adminApi.getInitiativeTasks(request, initiative.initiativeId),
        })))
        if (!ignore) {
          setTasks(taskLists.flatMap(({ initiative, tasks: initiativeTasks }) =>
            initiativeTasks.map((task) => ({ task, initiative })),
          ).slice(0, 5))
        }
      })
      .catch((requestError: Error) => { if (!ignore) setError(requestError.message) })
      .finally(() => { if (!ignore) setIsLoading(false) })
    return () => { ignore = true }
  }, [request, today])

  return (
    <Card title="Upcoming to-do tasks">
      {error ? <p className="auth-error" role="alert">Unable to load upcoming tasks: {error}</p> : isLoading ? <p>Loading upcoming tasks...</p> : tasks.length === 0 ? <p>No tasks are listed for upcoming events.</p> : (
        <div className="upcoming-task-list">
          {tasks.map(({ task, initiative }) => (
            <div className="upcoming-task-row" key={`${initiative.initiativeId}-${task.taskId}`}>
              <span className="row-badge">{initiative.startDate.slice(0, 10)}</span>
              <div className="upcoming-task-copy">
                <strong>{task.name}</strong>
                <span className="muted-copy">{initiative.title} · {task.applicationCount}{task.volunteersNeeded === null ? ' volunteers' : ` / ${task.volunteersNeeded} volunteers`}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <NavLink className="row-action upcoming-task-link" to="/tasks">Manage tasks</NavLink>
    </Card>
  )
}

function TablePage({ title, description, buttonLabel, columns, rows }: { title: string; description: string; buttonLabel: string; columns: string[]; rows: string[][] }) {
  return (
    <PageFrame title={title} description={description} buttonLabel={buttonLabel}>
      <Card>
        <DataTable columns={columns} rows={rows} />
      </Card>
    </PageFrame>
  )
}

function OrdersPage({ orders, request, onOrderUpdated }: { orders: AdminOrder[]; request: AdminRequester; onOrderUpdated: (order: AdminOrder) => void }) {
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null)
  const [activeAction, setActiveAction] = useState<'ship' | 'cancel' | 'payment' | null>(null)
  const [courierReference, setCourierReference] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [refunded, setRefunded] = useState(false)
  const [savingOrderId, setSavingOrderId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  function openOrderAction(orderId: number, action: 'ship' | 'cancel' | 'payment') {
    setActiveOrderId(orderId)
    setActiveAction(action)
    setCourierReference('')
    setCancelReason('')
    setPaymentReference('')
    setRefunded(false)
    setError(null)
    setMessage(null)
  }

  async function changeOrderStatus(order: AdminOrder, status: AdminOrderStatus) {
    const trimmedCourierReference = courierReference.trim()
    if (status === 'Shipped' && (
      trimmedCourierReference.length < 3
      || trimmedCourierReference.length > 60
      || !/^[\p{L}\p{N}][\p{L}\p{N} .#:/-]*$/u.test(trimmedCourierReference)
    )) {
      setError('Enter a courier reference 3–60 characters long. Use letters, numbers, spaces, or . # : / -.')
      return
    }

    const body = status === 'Shipped'
      ? { status, courierReference: trimmedCourierReference }
      : status === 'Cancelled'
        ? { status, reason: cancelReason.trim(), ...(order.paymentStatus === 'Paid' ? { refunded } : {}) }
        : { status }

    setSavingOrderId(order.orderId)
    setError(null)
    setMessage(null)
    try {
      const updatedOrder = await adminApi.updateOrderStatus(request, order.orderId, body)
      onOrderUpdated(updatedOrder)
      setActiveOrderId(null)
      setActiveAction(null)
      setMessage(`Order ${order.orderNumber} is now ${updatedOrder.statusLabel}.`)
    } catch (requestError) {
      setError(apiErrorMessage(requestError, 'Unable to update order status.'))
    } finally {
      setSavingOrderId(null)
    }
  }

  async function recordPayment(order: AdminOrder) {
    setSavingOrderId(order.orderId)
    setError(null)
    setMessage(null)
    try {
      const reference = paymentReference.trim()
      const updatedOrder = await adminApi.recordOrderPayment(request, order.orderId, {
        amount: order.totalCents / 100,
        ...(reference ? { reference } : {}),
      })
      onOrderUpdated(updatedOrder)
      setActiveOrderId(null)
      setActiveAction(null)
      setMessage(`Payment for order ${order.orderNumber} has been recorded.`)
    } catch (requestError) {
      setError(apiErrorMessage(requestError, 'Unable to record this payment.'))
    } finally {
      setSavingOrderId(null)
    }
  }

  function nextStatus(status: AdminOrderStatus): { label: string; status: AdminOrderStatus } | null {
    if (status === 'Confirmed') return { label: 'Mark packed', status: 'Packed' }
    if (status === 'Packed') return { label: 'Mark shipped', status: 'Shipped' }
    if (status === 'Shipped') return { label: 'Mark delivered', status: 'Delivered' }
    return null
  }

  return (
    <PageFrame title="Every order, accounted for." description="Record received payments and update fulfillment one step at a time." buttonLabel="Orders">
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      {message ? <p className="success-message" role="status">{message}</p> : null}
      <Card>
        {orders.length === 0 ? <p>No orders to display.</p> : (
          <div className="data-table-wrap">
            <table className="data-table orders-table">
              <thead>
                <tr>
                  {['Order', 'Customer', 'Placed', 'Items / Total', 'Payment', 'Fulfillment', 'Actions'].map((column) => <th key={column}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const action = nextStatus(order.status)
                  const canCancel = ['Pending payment', 'Confirmed', 'Packed'].includes(order.status)
                  const isActive = activeOrderId === order.orderId
                  const isSaving = savingOrderId === order.orderId
                  return (
                    <tr key={order.orderId}>
                      <td>{order.orderNumber}</td>
                      <td>{order.customer.name}</td>
                      <td>{new Date(order.placedAt).toLocaleDateString()}</td>
                      <td>{order.itemCount} / {order.total}</td>
                      <td>
                        {order.paymentStatus}
                        {!isActive && order.paymentStatus === 'Unpaid' ? <div><button className="table-action" type="button" disabled={savingOrderId !== null} onClick={() => openOrderAction(order.orderId, 'payment')}>Record payment</button></div> : null}
                      </td>
                      <td>
                        <span className="tag">{order.statusLabel}</span>
                        {order.courierReference ? <div className="muted-copy">Tracking: {order.courierReference}</div> : null}
                      </td>
                      <td>
                        <div className="row-controls">
                          {!isActive && action ? <button className="table-action" type="button" disabled={savingOrderId !== null} onClick={() => action.status === 'Shipped' ? openOrderAction(order.orderId, 'ship') : void changeOrderStatus(order, action.status)}>{action.label}</button> : null}
                          {!isActive && canCancel ? <button className="table-action" type="button" disabled={savingOrderId !== null} onClick={() => openOrderAction(order.orderId, 'cancel')}>Cancel</button> : null}
                          {isActive && activeAction === 'ship' ? (
                            <form className="order-status-form" noValidate onSubmit={(event) => { event.preventDefault(); void changeOrderStatus(order, 'Shipped') }}>
                              <label>Courier reference<input autoComplete="off" maxLength={60} minLength={3} onChange={(event) => { setCourierReference(event.target.value); setError(null) }} placeholder="e.g. TCG123456789" required value={courierReference} /></label>
                              <p className="muted-copy">Required: 3–60 characters; use letters, numbers, spaces, or . # : / -.</p>
                              <div className="row-controls"><button className="table-action" type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Confirm shipment'}</button><button className="table-action" type="button" disabled={isSaving} onClick={() => { setActiveOrderId(null); setActiveAction(null) }}>Close</button></div>
                            </form>
                          ) : null}
                          {isActive && activeAction === 'payment' ? (
                            <form className="order-status-form" onSubmit={(event) => { event.preventDefault(); void recordPayment(order) }}>
                              <p>Confirm receipt of {order.total} before recording payment.</p>
                              <label>Payment reference (optional)<input autoComplete="off" maxLength={100} minLength={2} onChange={(event) => setPaymentReference(event.target.value)} placeholder={`Defaults to ${order.orderNumber}`} value={paymentReference} /></label>
                              <div className="row-controls"><button className="table-action" type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Confirm payment received'}</button><button className="table-action" type="button" disabled={isSaving} onClick={() => { setActiveOrderId(null); setActiveAction(null) }}>Close</button></div>
                            </form>
                          ) : null}
                          {isActive && activeAction === 'cancel' ? (
                            <form className="order-status-form" onSubmit={(event) => { event.preventDefault(); void changeOrderStatus(order, 'Cancelled') }}>
                              <label>Reason sent to customer<textarea maxLength={500} minLength={3} onChange={(event) => setCancelReason(event.target.value)} required rows={2} value={cancelReason} /></label>
                              {order.paymentStatus === 'Paid' ? <label className="check-field"><input checked={refunded} onChange={(event) => setRefunded(event.target.checked)} required type="checkbox" /> Confirm that the payment was refunded</label> : null}
                              <div className="row-controls"><button className="table-action" type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Confirm cancellation'}</button><button className="table-action" type="button" disabled={isSaving} onClick={() => { setActiveOrderId(null); setActiveAction(null) }}>Close</button></div>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageFrame>
  )
}

function DonationPledgesPage({ request }: { request: AdminRequester }) {
  const [pledges, setPledges] = useState<AdminDonationPledge[]>([])
  const [page, setPage] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    setIsLoading(true)
    setError(null)
    setHasNextPage(false)
    adminApi.getDonationPledges(request, page)
      .then((result) => {
        if (!ignore) {
          setPledges(result)
          setHasNextPage(result.length === ADMIN_LIST_PAGE_SIZE)
        }
      })
      .catch((requestError: Error) => { if (!ignore) setError(requestError.message) })
      .finally(() => { if (!ignore) setIsLoading(false) })
    return () => { ignore = true }
  }, [page, request])

  return (
    <PageFrame title="Coordinate every contribution." description="Donation pledges submitted through the public website." buttonLabel="Donations">
      <Card title="Donation pledges">
        {error ? <p className="auth-error" role="alert">Unable to load donation pledges: {error}</p> : isLoading ? <p>Loading donation pledges...</p> : pledges.length === 0 ? <p>{page === 1 ? 'No donation pledges have been submitted yet.' : 'No more donation pledges are available.'}</p> : (
          <DataTable
            columns={['Reference', 'Submitted', 'Donor', 'Contact', 'Event', 'Type', 'Description', 'Estimated value', 'Status']}
            rows={pledges.map((pledge) => [
              pledge.referenceNumber,
              new Date(pledge.submittedAt).toLocaleDateString(),
              pledge.fullName,
              `${pledge.email} / ${pledge.phone}`,
              pledge.initiative?.title ?? 'General donation',
              pledge.category,
              pledge.description,
              pledge.estimatedValue ?? '—',
              pledge.status,
            ])}
          />
        )}
        {!error && !isLoading && (pledges.length > 0 || page > 1) ? (
          <TablePagination
            page={page}
            itemCount={pledges.length}
            isLoading={isLoading}
            hasNextPage={hasNextPage}
            onPageChange={setPage}
            label="Donation pledge pages"
          />
        ) : null}
      </Card>
    </PageFrame>
  )
}

function VolunteerApplicationsPage({ request }: { request: AdminRequester }) {
  const [applications, setApplications] = useState<AdminVolunteerApplication[]>([])
  const [page, setPage] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    setIsLoading(true)
    setError(null)
    setHasNextPage(false)
    adminApi.getVolunteerApplications(request, page)
      .then((result) => {
        if (!ignore) {
          setApplications(result)
          setHasNextPage(result.length === ADMIN_LIST_PAGE_SIZE)
        }
      })
      .catch((requestError: Error) => { if (!ignore) setError(requestError.message) })
      .finally(() => { if (!ignore) setIsLoading(false) })
    return () => { ignore = true }
  }, [page, request])

  return (
    <PageFrame title="Put willing hands to good work." description="Volunteer applications submitted through the public website." buttonLabel="Volunteers">
      <Card title="Volunteer applications">
        {error ? <p className="auth-error" role="alert">Unable to load volunteer applications: {error}</p> : isLoading ? <p>Loading volunteer applications...</p> : applications.length === 0 ? <p>{page === 1 ? 'No volunteer applications have been submitted yet.' : 'No more volunteer applications are available.'}</p> : (
          <DataTable
            columns={['Reference', 'Submitted', 'Volunteer', 'Phone', 'Email', 'Event', 'Task', 'Contribution', 'Availability', 'Status']}
            rows={applications.map((application) => [
              application.referenceNumber,
              new Date(application.submittedAt).toLocaleDateString(),
              application.fullName,
              application.phone,
              application.email ?? '—',
              application.initiative?.title ?? 'General volunteering',
              application.task?.name ?? 'General volunteering',
              application.contribution,
              application.availability,
              application.status,
            ])}
          />
        )}
        {!error && !isLoading && (applications.length > 0 || page > 1) ? (
          <TablePagination
            page={page}
            itemCount={applications.length}
            isLoading={isLoading}
            hasNextPage={hasNextPage}
            onPageChange={setPage}
            label="Volunteer application pages"
          />
        ) : null}
      </Card>
    </PageFrame>
  )
}

function TasksPage({ request }: { request: AdminRequester }) {
  const [initiatives, setInitiatives] = useState<AdminInitiative[]>([])
  const [selectedInitiativeId, setSelectedInitiativeId] = useState('')
  const [tasks, setTasks] = useState<AdminInitiativeTask[]>([])
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoadingInitiatives, setIsLoadingInitiatives] = useState(true)
  const [isLoadingTasks, setIsLoadingTasks] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let ignore = false
    setIsLoadingInitiatives(true)
    adminApi.getInitiatives(request)
      .then((result) => {
        if (ignore) return
        const available = result
          .filter((initiative) => initiative.status !== 'Closed')
          .sort((left, right) => left.startDate.localeCompare(right.startDate))
        setInitiatives(available)
        setSelectedInitiativeId((current) =>
          available.some((initiative) => String(initiative.initiativeId) === current)
            ? current
            : String(available[0]?.initiativeId ?? ''),
        )
      })
      .catch((requestError: Error) => { if (!ignore) setError(requestError.message) })
      .finally(() => { if (!ignore) setIsLoadingInitiatives(false) })
    return () => { ignore = true }
  }, [request])

  useEffect(() => {
    if (!selectedInitiativeId) {
      setTasks([])
      setIsLoadingTasks(false)
      return
    }
    let ignore = false
    setIsLoadingTasks(true)
    setTasks([])
    setError(null)
    setMessage(null)
    setEditingTaskId(null)
    adminApi.getInitiativeTasks(request, Number(selectedInitiativeId))
      .then((result) => { if (!ignore) setTasks(result) })
      .catch((requestError: Error) => { if (!ignore) setError(requestError.message) })
      .finally(() => { if (!ignore) setIsLoadingTasks(false) })
    return () => { ignore = true }
  }, [request, selectedInitiativeId])

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const name = String(values.get('name') ?? '').trim()
    const volunteersNeeded = String(values.get('volunteersNeeded') ?? '').trim()
    setError(null)
    setMessage(null)
    setIsSaving(true)
    try {
      const task = await adminApi.createInitiativeTask(request, Number(selectedInitiativeId), {
        name,
        volunteersNeeded: volunteersNeeded ? Number(volunteersNeeded) : null,
      })
      setTasks((current) => [...current, task])
      form.reset()
      setMessage('Task added to the event.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to add this task.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleUpdateTask(event: FormEvent<HTMLFormElement>, taskId: number) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const name = String(values.get('name') ?? '').trim()
    const volunteersNeeded = String(values.get('volunteersNeeded') ?? '').trim()
    setError(null)
    setMessage(null)
    setIsSaving(true)
    try {
      const task = await adminApi.updateInitiativeTask(request, Number(selectedInitiativeId), taskId, {
        name,
        volunteersNeeded: volunteersNeeded ? Number(volunteersNeeded) : null,
      })
      setTasks((current) => current.map((item) => item.taskId === taskId ? task : item))
      setEditingTaskId(null)
      setMessage('Task updated.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update this task.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteTask(task: AdminInitiativeTask) {
    if (!window.confirm(`Remove "${task.name}" from this event?`)) return
    setError(null)
    setMessage(null)
    setIsSaving(true)
    try {
      const result = await adminApi.deleteInitiativeTask(request, Number(selectedInitiativeId), task.taskId)
      if (!result.deleted) throw new Error('The task was not removed.')
      setTasks((current) => current.filter((item) => item.taskId !== task.taskId))
      setMessage('Task removed.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to remove this task.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <PageFrame title="Organize event tasks." description="Create and manage the volunteer tasks attached to each event." buttonLabel="To-do tasks">
      <Card title="Manage event tasks">
        {isLoadingInitiatives ? <p>Loading events...</p> : initiatives.length === 0 && error ? <p className="auth-error" role="alert">Unable to load events: {error}</p> : initiatives.length === 0 ? <p>No open events are available for task management.</p> : (
          <>
            <div className="task-manager-toolbar">
              <label className="task-event-picker">Event
                <select value={selectedInitiativeId} disabled={isSaving || isLoadingTasks} onChange={(event) => setSelectedInitiativeId(event.target.value)}>
                  {initiatives.map((initiative) => <option key={initiative.initiativeId} value={initiative.initiativeId}>{initiative.title}</option>)}
                </select>
              </label>
              <span className="tag">{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</span>
            </div>
            {error ? <p className="auth-error task-feedback" role="alert">{error}</p> : null}
            {message ? <p className="success-message task-feedback" role="status">{message}</p> : null}
            <form className="task-create-form" onSubmit={(event) => void handleCreateTask(event)}>
              <label>Task name<input name="name" minLength={2} maxLength={100} placeholder="e.g. Sort donated clothing" required /></label>
              <label>Volunteers needed<input name="volunteersNeeded" type="number" min={1} max={10000} placeholder="Optional" /></label>
              <button className="primary-button" disabled={isSaving || isLoadingTasks} type="submit">+ Add task</button>
            </form>
            {isLoadingTasks ? <p>Loading event tasks...</p> : tasks.length === 0 ? error ? null : <p>No tasks have been added to this event yet.</p> : (
              <div className="task-list">
                {tasks.map((task) => editingTaskId === task.taskId ? (
                  <form className="task-edit-row" key={task.taskId} onSubmit={(event) => void handleUpdateTask(event, task.taskId)}>
                    <label>Task name<input name="name" defaultValue={task.name} minLength={2} maxLength={100} required /></label>
                    <label>Volunteers needed<input name="volunteersNeeded" type="number" defaultValue={task.volunteersNeeded ?? ''} min={1} max={10000} /></label>
                    <span className="muted-copy">{task.applicationCount} applications</span>
                    <div className="row-controls">
                      <button className="primary-button" type="submit" disabled={isSaving}>Save</button>
                      <button className="secondary-button" type="button" disabled={isSaving} onClick={() => setEditingTaskId(null)}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <div className="task-row" key={task.taskId}>
                    <div className="task-row-copy">
                      <strong>{task.name}</strong>
                      <span className="muted-copy">{task.applicationCount} applications · {task.volunteersNeeded === null ? 'No volunteer limit' : `${task.volunteersNeeded} volunteers needed`}</span>
                    </div>
                    <div className="row-controls">
                      <button className="table-action" type="button" disabled={isSaving} onClick={() => setEditingTaskId(task.taskId)}>Edit</button>
                      <button
                        className="table-action"
                        type="button"
                        disabled={isSaving || task.applicationCount > 0}
                        title={task.applicationCount > 0 ? 'Tasks with volunteer applications cannot be removed.' : 'Remove task'}
                        onClick={() => void handleDeleteTask(task)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>
    </PageFrame>
  )
}

function TablePagination({
  page,
  itemCount,
  isLoading,
  hasNextPage,
  onPageChange,
  label,
}: {
  page: number
  itemCount: number
  isLoading: boolean
  hasNextPage: boolean
  onPageChange: (page: number) => void
  label: string
}) {
  const firstItem = (page - 1) * ADMIN_LIST_PAGE_SIZE + 1
  const lastItem = firstItem + itemCount - 1

  return (
    <nav className="table-pagination" aria-label={label}>
      <button className="secondary-button pagination-button" type="button" disabled={page === 1 || isLoading} onClick={() => onPageChange(page - 1)}>
        Previous
      </button>
      <span className="pagination-summary" aria-live="polite">
        {itemCount > 0 ? `Showing ${firstItem}–${lastItem} · Page ${page}` : `Page ${page}`}
      </span>
      <button className="secondary-button pagination-button" type="button" disabled={!hasNextPage || isLoading} onClick={() => onPageChange(page + 1)}>
        Next
      </button>
    </nav>
  )
}

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="card">
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  )
}

function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`}>
              {row.map((value, cellIndex) => (
                <td key={`${value}-${cellIndex}`}>{value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default App