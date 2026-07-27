import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ItemsProvider } from './ItemsContext'
import { SettingsProvider } from './SettingsContext'
import { ItemFormPage } from './pages/ItemFormPage'
import { ListPage } from './pages/ListPage'
import { ProfitsPage } from './pages/ProfitsPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  return (
    <SettingsProvider>
      <ItemsProvider>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<ListPage />} />
              <Route path="profits" element={<ProfitsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="items/new" element={<ItemFormPage />} />
              <Route path="items/:id" element={<ItemFormPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </ItemsProvider>
    </SettingsProvider>
  )
}
