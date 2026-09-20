import {useState} from 'react';
import Dashboard from './pages/Dashboard';
import Project from './pages/Project';
import './styles.css';

export default function App(){const [project,setProject]=useState<number>();return project?<Project id={project} onBack={()=>setProject(undefined)}/>:<Dashboard open={setProject}/>}