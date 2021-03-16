import { ObservableStore} from "./observable-store"
import React, { ComponentType,FunctionComponent, useEffect, useMemo, useState } from 'react';
import {debounceTime,switchMap} from 'rxjs/operators';
import { from, Observable,Observer } from 'rxjs';

enum StoreActions {
    InitializeState = 'INITIALIZE_STATE',
    AddState = 'ADD_STATE',
    RemoveState = 'REMOVE_STATE',
    UpdateState = 'UPDATE_STATE',
}
type stateFunc<T> = (state: T) => Partial<T>;
type ajaxFunc<T> = (data:T)=>Promise<any>;
interface Action<T>{
    type:StoreActions,
    payload:T
}

type funAction<T> = (state?: T) =>Action<T>;

class FelixObservableStore<T> extends ObservableStore<T> {
    public initialState: T;

    public storeMap:Object

    //构造函数
    constructor(){
        super({ trackStateHistory: true, logStateChanges: true });
        if(this.initialState){
            this.setState(this.initialState,StoreActions.InitializeState)
        }   
    }

    //使用自定义 use hook
    public useObservable(outState:unknown,key:string){
        let store:ObservableStore<any>
        if(this.storeMap[key]){
            store = this.storeMap[key]
        }else{
            store = new ObservableStore({ trackStateHistory: true, logStateChanges: true })
            store.setState(outState,StoreActions.InitializeState)
            this.storeMap[key] = store
        }
        const [state,setState] = useState(outState)
        useEffect(()=>{
            const subject= store.stateChanged.subscribe(s=>setState(s))
            return function(){
                subject.unsubscribe()
            }
        },[])

        return [state,store]
    }



    public connect(CMP:ComponentType<any>,mapStateToProps:stateFunc<T>):FunctionComponent{
        return (props:unknown):JSX.Element =>{
            const [state,setState] = useState(mapStateToProps(this.getState()))
            useEffect(()=>{
                const subject= this.stateChanged.subscribe(s=>setState(s))
                return function(){
                    subject.unsubscribe()
                }
            },[])
            return useMemo(()=><CMP {...props} store={{...state}} />,[state]) 
        }
    }
    

    ajaxform<Data>(ajax:ajaxFunc<Data>,debounceTimes?:number){
        return new Observable().pipe(
            debounceTimes&&debounceTime(debounceTimes),
            switchMap(()=>from(ajax)) 
        ).toPromise()
        // this.stateChanged = new Observable((observer: Observer<any>) => {
        //     new Observable().pipe(
        //         debounceTimes&&debounceTime(debounceTimes),
        //         switchMap(()=>from(ajax))
        //     ).subscribe((res)=>{
        //         const state = callback(res)
        //         this.setState(state)
        //     })
        // });
    
    }

    dispatch(action:Action<T>){
        this.setState(action.payload,action.type)
    }

    add(state:T){
        this.setState(state,StoreActions.AddState)
    }

    remove(state:T){
        this.setState(state,StoreActions.RemoveState)
    }

    updete(state:T){
        this.setState(state,StoreActions.UpdateState)
    }


}

export default FelixObservableStore
export const FelixObservableStoreInstance =new FelixObservableStore()