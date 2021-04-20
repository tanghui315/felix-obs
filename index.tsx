import { ObservableStore, ObservableStoreSettings} from "./observable-store"
import React, { ComponentType,FunctionComponent, useEffect, useMemo, useState } from 'react';
import {debounceTime} from 'rxjs/operators';
import { timer, BehaviorSubject,Observable,  Subscription } from 'rxjs';
import useConstant from 'use-constant'

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
type obsFunc<T> = (obs: Observable<T>) => Observable<T>

interface complex<T> { [x: string]: T; }
export interface IParams {
    [propName: string]: any
}

class FelixObservableStore<T> extends ObservableStore<T> {
    //构造函数
    constructor(method?: string, state?: T) {
        super({ trackStateHistory: false, logStateChanges: false });
        if(method && state){
            this.setState({ [method]: state } as any,StoreActions.InitializeState,false)
        }
    }

    private _setState(state: complex<T> | Partial<T> | stateFunc<T>) {
        switch (typeof state) {
            case 'function':
                const newState = state(this.getState(true));
                this.setState(newState);
                break;
            case 'object':
                this.setState(state as any);
                break;
            default:
                this.setState(() => state)
        }
    }

    public dispatch(key:string,state: any) {
        this._setState({ [key]: state })
    }
    //定时清除
    public dispatchWithTimerClean(key:string,state: T,cleanTime:number){
        this._setState({ [key]: state })
        timer(cleanTime*1000).subscribe(()=>{
            let innerState = this.getState()
            delete innerState[key] 
            this.setState(innerState,StoreActions.RemoveState,false)
        })
    }

    public getStateByKey(key:string){
        let state = this.getState()
        return (state&&state[key])?state[key]:null
    }

    public connect(CMP:ComponentType<any>):FunctionComponent{
        return (props:unknown):JSX.Element =>{
            const [state,setState] = useState(this.getState())
            useEffect(()=>{
                const subject= this.stateChanged.subscribe(s=>setState(s))
                return function(){
                    subject.unsubscribe()
                }
            },[])
            return useMemo(()=><CMP {...props} state={{...state}} />,[state]) 
        }
    }
    

    // ajaxform<Data>(ajax:ajaxFunc<Data>,debounceTimes?:number){
    //     return new Observable().pipe(
    //         debounceTimes&&debounceTime(debounceTimes),
    //         switchMap(()=>from(ajax)) 
    //     ).toPromise()
    // }

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

export function useObservableStore<T>(initState: T, additional?: obsFunc<T> | null,customKey?:string): [T, (state: T) => void,string] {
    const KEY = useConstant(() =>customKey ? customKey : Math.random().toString(36).slice(-8))
    const [state, setState] = useState(initState)
    const store = useConstant(() => new FelixObservableStore(KEY,initState))
    const $input = new BehaviorSubject<T>(initState)
    useEffect(() => {
        let customSub: Subscription
        if (additional) {
            customSub = additional($input).subscribe(state => {
                state && store.dispatch(KEY,state)
            })
        }
        const subscription = store.stateChanged.subscribe(state => {
            state && setState(state[KEY])
  
        })
        return function () {
            subscription.unsubscribe()
            customSub && customSub.unsubscribe()
            $input.complete()
        }
    }, [])

    return [state, (state) => store.dispatch(KEY,state),KEY]
}

export const FelixObsInstance = new FelixObservableStore()
export default FelixObservableStore