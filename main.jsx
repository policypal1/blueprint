import React from 'react';
import { createRoot } from 'react-dom/client';
import EditorApp from './App.jsx';
import ProductApp from './ProductApp.jsx';
import './styles.css';
import './launch.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ProductApp EditorComponent={EditorApp} />
  </React.StrictMode>,
);
