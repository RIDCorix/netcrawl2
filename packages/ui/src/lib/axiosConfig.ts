/**
 * Configure axios defaults for cloud mode.
 * Must be imported early (before any axios calls).
 */
import axios from 'axios';
import { API_BASE } from './api';

// Set base URL for all axios requests
axios.defaults.baseURL = API_BASE;

// Add auth token to all requests
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('netcrawl-token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
