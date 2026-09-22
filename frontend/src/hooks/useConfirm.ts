import {useContext} from 'react';
import {ConfirmCtx} from '../components/ConfirmModal';

export function useConfirm(){
 const ctx = useContext(ConfirmCtx);
 if(!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>');
 return ctx;
}