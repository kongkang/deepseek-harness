/** Browser entry for the standalone WaiBrain interface prototype. */

import './styles.css'
import { mountApp } from './app.ts'

const root = document.getElementById('root')
if (root === null) throw new Error('waibrain: missing #root')
mountApp(root)
