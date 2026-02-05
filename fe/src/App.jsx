import { useState } from 'react'
import axios from 'axios'
import './App.css'

const API_BASE = 'http://localhost:3001'

function App() {
  const [status, setStatus] = useState({ message: 'Ready', type: 'info' })
  const [loading, setLoading] = useState(false)
  const [streamStats, setStreamStats] = useState({ count: 0, bytes: 0, lastId: null })
  const [streamLogs, setStreamLogs] = useState([])

  const [data, setData] = useState([])
  const [cursor, setCursor] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [activeEndpoint, setActiveEndpoint] = useState(null)
  const [activeName, setActiveName] = useState('')

  // Archive Batch State
  const [batches, setBatches] = useState([])
  const [showBatchPanel, setShowBatchPanel] = useState(false)
  const [batchPreview, setBatchPreview] = useState(null)
  const [cutoffDate, setCutoffDate] = useState('')

  const startFetching = (endpoint, name) => {
      setData([])
      setCursor(0)
      setHasMore(true)
      setActiveEndpoint(endpoint)
      setActiveName(name)
      fetchDataPage(endpoint, 0, name)
  }

  const fetchDataPage = async (endpoint, currentCursor, name) => {
    setLoading(true)
    setStatus({ message: `Fetching ${name} page...`, type: 'loading' })

    try {
      const response = await fetch(`${API_BASE}${endpoint}?cursor=${currentCursor}&limit=50`)
      const newData = await response.json()
      
      if (newData.length > 0) {
          setData(prev => [...prev, ...newData])
          setCursor(newData[newData.length - 1].id)
          setHasMore(true)
          setStatus({ message: `Loaded ${newData.length} items from ${name}`, type: 'success' })
      } else {
          setHasMore(false)
          setStatus({ message: `No more data in ${name}`, type: 'info' })
      }
    } catch (error) {
      console.error(error)
      setStatus({ message: `Failed to fetch ${name}`, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const loadMore = () => {
      if (!loading && hasMore && activeEndpoint) {
          fetchDataPage(activeEndpoint, cursor, activeName)
      }
  }

  const handleAction = async (endpoint, actionName) => {
    setLoading(true)
    setStatus({ message: `Executing ${actionName}...`, type: 'loading' })
    try {
      const response = await axios.get(`${API_BASE}${endpoint}`)
      setStatus({ 
        message: response.data.message || 'Action completed successfully', 
        type: 'success' 
      })
    } catch (error) {
      console.error(error)
      setStatus({ 
        message: `Error: ${error.response?.data?.error || error.message}`, 
        type: 'error' 
      })
    } finally {
      setLoading(false)
    }
  }

  // ============ ARCHIVE BATCH FUNCTIONS ============
  
  const fetchBatches = async () => {
    try {
      const response = await axios.get(`${API_BASE}/archive-batch`)
      setBatches(response.data)
    } catch (error) {
      console.error('Failed to fetch batches:', error)
    }
  }

  const fetchPreview = async (date) => {
    try {
      const url = date 
        ? `${API_BASE}/archive-batch/preview?cutoff_date=${date}`
        : `${API_BASE}/archive-batch/preview`
      const response = await axios.get(url)
      setBatchPreview(response.data)
    } catch (error) {
      console.error('Failed to fetch preview:', error)
    }
  }

  const createBatch = async () => {
    setLoading(true)
    setStatus({ message: 'Creating archive batch...', type: 'loading' })
    try {
      const payload = cutoffDate ? { cutoff_date: cutoffDate } : {}
      const response = await axios.post(`${API_BASE}/archive-batch`, payload)
      setStatus({ 
        message: `Batch created! Will archive ${response.data.preview.tasksCount} tasks and ${response.data.preview.candidatesCount} candidates`, 
        type: 'success' 
      })
      setCutoffDate('')
      setBatchPreview(null)
      fetchBatches()
    } catch (error) {
      setStatus({ 
        message: `Error: ${error.response?.data?.error || error.message}`, 
        type: 'error' 
      })
    } finally {
      setLoading(false)
    }
  }

  const runBatch = async (batchId) => {
    setLoading(true)
    setStatus({ message: `Running migration for batch #${batchId}...`, type: 'loading' })
    try {
      const response = await axios.post(`${API_BASE}/archive-batch/${batchId}/run`)
      setStatus({ 
        message: response.data.message || 'Migration completed!', 
        type: 'success' 
      })
      fetchBatches()
    } catch (error) {
      setStatus({ 
        message: `Error: ${error.response?.data?.error || error.message}`, 
        type: 'error' 
      })
      fetchBatches()
    } finally {
      setLoading(false)
    }
  }

  const openBatchPanel = () => {
    setShowBatchPanel(true)
    fetchBatches()
    fetchPreview()
  }

  return (
    <div className="App">
      <h1>DB Management</h1>
      <p className="read-the-docs">
        Simple interface to manage Primary and Archive databases.
      </p>

      <div className="card">
        <div className="button-group">
          {/* <button 
            className="primary" 
            onClick={() => handleAction('/add-sample-data', 'Add Sample Data')}
            disabled={loading}
          >
            Add Sample Data
          </button>
          
          <button 
            className="danger" 
            onClick={() => handleAction('/remove-primary-data', 'Clear Primary DB')}
            disabled={loading}
          >
            Clear Primary DB
          </button>

          <button 
            className="secondary" 
            onClick={() => handleAction('/remove-archive-data', 'Clear Archive DB')}
            disabled={loading}
          >
            Clear Archive DB
          </button> */}

          <button 
            className="primary" 
            style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}
            onClick={openBatchPanel}
            disabled={loading}
          >
            📦 Manage Archive Batches
          </button>

          <button 
            className="secondary" 
            style={{ backgroundColor: '#2dd4bf' }}
            onClick={() => startFetching('/stream-primary-data', 'Primary')}
            disabled={loading}
          >
            Fetch Primary Data
          </button>

          <button 
            className="secondary" 
            style={{ backgroundColor: '#8b5cf6' }}
            onClick={() => startFetching('/stream-archive-data', 'Archive')}
            disabled={loading}
          >
            Fetch Archive Data
          </button>
        </div>

        {/* ============ ARCHIVE BATCH PANEL ============ */}
        {showBatchPanel && (
          <div className="batch-panel" style={{
            marginTop: '2rem',
            padding: '1.5rem',
            background: 'rgba(251, 191, 36, 0.1)',
            borderRadius: '12px',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: '#fbbf24' }}>📦 Archive Batch Management</h3>
              <button 
                onClick={() => setShowBatchPanel(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            {/* Create New Batch */}
            <div style={{ 
              background: 'rgba(0,0,0,0.2)', 
              padding: '1rem', 
              borderRadius: '8px',
              marginBottom: '1rem'
            }}>
              <h4 style={{ margin: '0 0 1rem 0', color: '#fff' }}>Create New Batch</h4>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                    Cutoff Date (optional)
                  </label>
                  <input 
                    type="date" 
                    value={cutoffDate}
                    onChange={(e) => {
                      setCutoffDate(e.target.value)
                      if (e.target.value) fetchPreview(e.target.value)
                    }}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.05)',
                      color: '#fff',
                      fontSize: '1rem'
                    }}
                  />
                </div>
                <button 
                  className="primary"
                  onClick={createBatch}
                  disabled={loading}
                  style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}
                >
                  Create Batch
                </button>
              </div>
              
              {batchPreview && (
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(251,191,36,0.1)', borderRadius: '6px' }}>
                  <span style={{ color: '#fbbf24' }}>Preview: </span>
                  <span style={{ color: '#fff' }}>
                     {batchPreview.candidatesCount} candidates 
                  </span>
                  <span style={{ color: '#94a3b8' }}> (before {batchPreview.cutoff_date})</span>
                </div>
              )}
            </div>

            {/* Batch History */}
            <div>
              <h4 style={{ margin: '0 0 0.5rem 0', color: '#fff' }}>Batch History</h4>
              {batches.length === 0 ? (
                <p style={{ color: '#64748b', fontStyle: 'italic' }}>No batches yet</p>
              ) : (
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {batches.map(batch => (
                    <div key={batch.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.75rem',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: '6px',
                      marginBottom: '0.5rem'
                    }}>
                      <div>
                        <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>#{batch.id}</span>
                        <span style={{ color: '#94a3b8', marginLeft: '1rem' }}>
                          Cutoff: {batch.cutoff_date}
                        </span>
                        <span style={{ 
                          marginLeft: '1rem',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          background: batch.status === 'completed' ? 'rgba(34,197,94,0.2)' : 
                                     batch.status === 'failed' ? 'rgba(239,68,68,0.2)' :
                                     batch.status === 'running' ? 'rgba(59,130,246,0.2)' : 'rgba(251,191,36,0.2)',
                          color: batch.status === 'completed' ? '#22c55e' : 
                                 batch.status === 'failed' ? '#ef4444' :
                                 batch.status === 'running' ? '#3b82f6' : '#fbbf24'
                        }}>
                          {batch.status}
                        </span>
                        {batch.status === 'completed' && (
                          <span style={{ color: '#64748b', marginLeft: '1rem', fontSize: '0.85rem' }}>
                            ({batch.archived_tasks_count} tasks, {batch.archived_candidates_count} candidates)
                          </span>
                        )}
                      </div>
                      {batch.status === 'pending' && (
                        <button
                          onClick={() => runBatch(batch.id)}
                          disabled={loading}
                          style={{ 
                            padding: '4px 12px', 
                            fontSize: '0.85rem',
                            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                          }}
                        >
                          ▶ Run
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {data.length > 0 && (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{data.length.toLocaleString()}</div>
                <div className="stat-label">Total Loaded</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">#{cursor}</div>
                <div className="stat-label">Last Cursor ID</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{activeName}</div>
                <div className="stat-label">Source DB</div>
              </div>
            </div>

            <div 
                className="log-container" 
                style={{ maxHeight: '500px' }}
                onScroll={(e) => {
                    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
                    // Trigger when within 50px of the bottom
                    if (scrollHeight - scrollTop <= clientHeight + 50) {
                        loadMore();
                    }
                }}
            >
                {data.map((item) => (
                    <div key={item.id} className="log-entry">
                        <span className="log-id" style={{ width: '80px', display: 'inline-block', fontWeight: 'bold' }}>#{item.id}</span>
                        <span style={{ color: '#fff', flex: 1 }}>{item.name}</span>
                        <span style={{ 
                          background: 'rgba(255,255,255,0.1)', 
                          padding: '2px 8px', 
                          borderRadius: '4px',
                          fontSize: '0.75em',
                          color: '#a855f7'
                        }}>{item.task_name}</span>
                    </div>
                ))}

                {loading && (
                    <div style={{ padding: '15px', textAlign: 'center', color: '#94a3b8' }}>
                        <span className="loading">Loading more items...</span>
                    </div>
                )}
                
                {!hasMore && (
                    <div style={{ padding: '15px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                        No more items to load
                    </div>
                )}
            </div>
          </>
        )}

        <div className="status">
          <p className={status.type}>{status.message}</p>
        </div>
      </div>
    </div>
  )
}

export default App
