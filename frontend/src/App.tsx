import {useState} from 'react';
import Dashboard from './pages/Dashboard';
import Project from './pages/Project';
import ConfirmProvider from './components/ConfirmModal';
import './styles.css';

export default function App(){
 const [project,setProject]=useState<number>();
 return project?<ConfirmProvider><Project id={project} onBack={()=>setProject(undefined)}/></ConfirmProvider>:<ConfirmProvider><Dashboard open={setProject}/></ConfirmProvider>;
}