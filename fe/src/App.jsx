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

  return (
    <div className="App">
      <h1>DB Management</h1>
      <p className="read-the-docs">
        Simple interface to manage Primary and Archive databases.
      </p>

      <div className="card">
        <div className="button-group">
          <button 
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
          </button>

          <button 
            className="primary" 
            style={{ backgroundColor: '#e67700' }}
            onClick={() => handleAction('/run-archive-migration', 'Archive Migration')}
            disabled={loading}
          >
            Run Archive Migration
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
