import { ObservableStore } from "./observable-store"
import React, { ComponentType, FunctionComponent, useEffect, useMemo, useState } from 'react';
import { debounceTime, retryWhen, scan, delayWhen, throttleTime, catchError, switchMap, map } from 'rxjs/operators';
import { timer, BehaviorSubject, Observable, Subscription, from, of } from 'rxjs';
import EmitterInstance, { Emitter } from './event-emitter'
import useConstant from 'use-constant'

//自定义一个错误重试的操作符
const retryWhenDelay = function (count: number, initialDelayTime: number) {
    return retryWhen((err$) => {
        return err$.pipe(
            scan((errCount, err) => {
                if (errCount >= count) {
                    throw new Error(err)
                }
                return errCount + 1
            }),
            delayWhen(errCount => timer(initialDelayTime * errCount))
        )
    })
}

interface AjaxSetting {
    initData?: any,
    debounceTimes?: number, //防抖配置
    throllteTimes?: number,//节流配置
    retryCount?: number,
    initialDelayTimes?: number,
    fetchCacheTimes?: number //接口数据缓存时间
}

enum StoreActions {
    InitializeState = 'INITIALIZE_STATE',
    AddState = 'ADD_STATE',
    RemoveState = 'REMOVE_STATE',
    UpdateState = 'UPDATE_STATE',
    UndefindState = 'UNDEFINED_STATE'
}
type stateFunc<T> = (state: T) => Partial<T>;
type ajaxFunc<T> = (data: T) => Promise<any>;

interface Action<T> {
    type: StoreActions,
    payload: T
}


type funAction<T> = (state?: T) => Action<T>;
type obsFunc<T> = (obs: Observable<T>) => Observable<T>

interface complex<T> { [x: string]: T; }
export interface IParams {
    [propName: string]: any
}

interface FelixObjType {
    [className: string]: FelixObservableStore<unknown>
}

class FelixObservableStore<T> extends ObservableStore<T> {

    private _backIndex: number = -1  //撤销返回的标记
    private static instances: FelixObjType = {};

    // static context:object = {}
    //构造函数
    constructor(method?: string, state?: T) {
        super({ trackStateHistory: true });
        this.init(method, state)
    }

    public static getInstance(method?: string, state?: unknown) {
        const className = this.name
        if (!FelixObservableStore.instances || (!FelixObservableStore.instances[className])) {
            if (className === "FelixObservableStore") {
                FelixObservableStore.instances[className] = new FelixObservableStore(method, state)
            } else {
                const obj = Object.create(this.prototype);
                FelixObservableStore.instances[className] = new obj.constructor(method, state);
            }

        } else {
            FelixObservableStore.instances[className].init(method, state)
        }
        return FelixObservableStore.instances[className];
    }

    init(method?: string, state?: T) {
        const key = method ? this._getKey(method) : ""
        const loadKey = this._getKey("loading")
        if (key && state) {
            this.setState({
                [loadKey]: true,
                [key]: state
            } as any, StoreActions.InitializeState, false)
        }
    }

    private _getKey(method: string) {
        let className = this.constructor.name
        return `${className}-${method}`
    }

    get getEmitter(): Emitter {
        return EmitterInstance
    }

    private _setState(state: complex<T> | Partial<T> | stateFunc<T>) {
        this._backIndex = -1
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

    public dispatchWithoutNotify(key: string, state: T, action: StoreActions = StoreActions.UndefindState) {
        if (key && state) {
            const method = this._getKey(key)
            this.setState({ [method]: state } as any, action, false)
        }
    }

    public dispatch(key: string, state: T) {
        if (!state) {
            return
        }
        const method = this._getKey(key)
        this._setState({ [method]: state })
    }
    //定时清除
    public dispatchWithTimerClean(key: string, state: T, cleanTime: number) {
        if (!state) {
            return
        }
        const method = this._getKey(key)
        this._setState({ [method]: state })
        if (cleanTime > 0) {
            timer(cleanTime * 1000).subscribe(() => {
                this.setState({ [method]: null } as any, StoreActions.RemoveState, false)
            })
        }
    }

    public getStateByKey(key: string) {
        let state = this.getState()
        const method = this._getKey(key)
        return (state && state[method]) ? state[method] : null
    }

    public getAllState() {
        return this.getState()
    }

    //将数据返回到上一个状态
    public prevState() {
        if (!this.stateHistory || this.stateHistory.length === 0 || this._backIndex === -2) {
            return
        }
        if (this._backIndex === -1) {
            this._backIndex = this.stateHistory.length - 1
        }
        if (this._backIndex === 0) { //开始的状态，直接初始化
            this._backIndex = -2
            this.setState({}, StoreActions.InitializeState, true, true, false)
            return
        }
        const prevStateHistory = this.stateHistory[this._backIndex]
        if (prevStateHistory && prevStateHistory.beginState) {
            this._backIndex -= 1
            //撤销操作不跟踪历史
            this.setState(prevStateHistory.beginState, prevStateHistory.action, true, true, false)
        }
    }
    //将数据返回到下一个状态
    public nextState() {
        if (!this.stateHistory || this.stateHistory.length === 0 || this._backIndex === -1) {
            return
        }
        if (this._backIndex === -2) {
            this._backIndex = 0
        } else {
            this._backIndex += 1
        }
        if (this._backIndex === this.stateHistory.length) { // 最大状态返回
            return
        }
        const prevStateHistory = this.stateHistory[this._backIndex]
        if (prevStateHistory && prevStateHistory.endState) {
            //恢复操作不跟踪历史
            this.setState(prevStateHistory.endState, prevStateHistory.action, true, true, false)
        }
    }


    //连接注入sate数据
    public connect(CMP: ComponentType<any>, isGlobal: boolean = false): FunctionComponent {
        const className = this.constructor.name
        return (props: unknown): JSX.Element => {
            const [state, setState] = useState(this.getState())
            const mySetState = (s: IParams) => {
                if (!s) {
                    return
                }
                let myState = {}
                for (const key in s) {
                    if (Object.prototype.hasOwnProperty.call(s, key)) {
                        if (key.indexOf(className) !== -1) {
                            const keys = key.split('-')
                            myState[keys[1]] = s[key]
                        }
                    }
                }
                setState(myState as any)
            }
            useEffect(() => {
                const subject = isGlobal ? this.globalStateChanged.subscribe(s => mySetState(s)) : this.stateChanged.subscribe(s => mySetState(s))
                return function () {
                    subject.unsubscribe()
                }
            }, [])
            return useMemo(() => <CMP {...props} state={{ ...state }} />, [state])
        }
    }

    //单独的数据处理
    public fetchDataWithoutAuto(keOrData: string | T | null, handler: ajaxFunc<any>, setting?: AjaxSetting) {
        const $obs = new Observable((observer) => observer.next((setting && setting.initData) ? setting.initData : null));
        let cacheData = null
        if (typeof keOrData === "string") {
            cacheData = this.getStateByKey(keOrData)
        } else {
            cacheData = keOrData  //自己处理传递data
        }
        return $obs.pipe(
            (setting && setting.debounceTimes) ? debounceTime(setting.debounceTimes) : (obs) => obs,
            (setting && setting.throllteTimes) ? throttleTime(setting.throllteTimes) : (obs) => obs,
            switchMap(() => cacheData ? of(cacheData) : from(handler).pipe(
                map((reslut: any) => reslut.data ? reslut.data : reslut),
                (setting && setting.retryCount) ? retryWhenDelay(setting.retryCount, setting.initialDelayTimes) : (obs) => obs,
                catchError(err => {
                    console.log("ERROR:", err.message) //
                    return of(null)
                })
            ))
        )
    }

    //接口的数据
    public fetchDataAuto(key: string, handler: ajaxFunc<any>, setting?: AjaxSetting) {
        const $obs = new Observable((observer) => observer.next((setting && setting.initData) ? setting.initData : null));
        let cacheData = null
        if (setting?.fetchCacheTimes) {
            cacheData = this.getStateByKey(key)
        }
        $obs.pipe(
            (setting && setting.debounceTimes) ? debounceTime(setting.debounceTimes) : (obs) => obs,
            (setting && setting.throllteTimes) ? throttleTime(setting.throllteTimes) : (obs) => obs,
            switchMap(() => cacheData ? of(cacheData) : from(handler).pipe(
                map((reslut: any) => reslut.data ? reslut.data : reslut),
                (setting && setting.retryCount) ? retryWhenDelay(setting.retryCount, setting.initialDelayTimes) : (obs) => obs,
                catchError(err => {
                    console.log("ERROR:", err.message) //
                    return of(null)
                })
            )),
        ).subscribe((data: any) => setting?.fetchCacheTimes ? this.dispatchWithTimerClean(key, data, setting.fetchCacheTimes) : this.dispatch(key, data))
    }

    //保存数据
    public saveApiData(handler: ajaxFunc<any>, setting?: AjaxSetting, callback?: (value: any) => void) {
        const $obs = new Observable((observer) => observer.next(setting.initData ? setting.initData : null));
        $obs.pipe(
            setting.debounceTimes && debounceTime(setting.debounceTimes),
            setting.throllteTimes && throttleTime(setting.throllteTimes),
            switchMap(() => from(handler).pipe(
                map((reslut: any) => reslut.data ? reslut.data : reslut),
                setting.retryCount && retryWhenDelay(setting.retryCount, setting.initialDelayTimes),
                catchError(err => {
                    console.log("ERROR:", err.message) //
                    return of(null)
                })
            )),
        ).subscribe(callback ? callback : (data) => { console.log("save ok") })
    }

    //合并控制change
    public runInAction(fn: () => void) {
        this.globalDispatchState = false
        try {
            fn.apply(this)
        } catch (err) {
            throw err
        }
        this.globalDispatchState = true
        if (this.stateHistory) {
            const stateHistory = this.stateHistory.pop()
            if (stateHistory) {
                this.setState(stateHistory.endState, stateHistory.action, true, true)
            }
        }
    }


}

//定义一个装饰器
export function observable(target: any, name: string, descriptor: any) {
    const initData = descriptor ? descriptor.initializer.call(this) : null
    const felixStore = target ? target.constructor.getInstance(name, initData) : FelixObservableStore.getInstance(name, initData)
    return {
        enumerable: true,
        configurable: true,
        get: function () {
            return felixStore.getStateByKey(name)
        },
        set: function (v: any) {
            return felixStore.dispatch(name, v)
        }
    }
}


export function useObservableStore<T>(initState: T, additional?: obsFunc<T> | null, customKey?: string): [T, (state: T) => void, string] {
    const KEY = useConstant(() => customKey ? customKey : Math.random().toString(36).slice(-8))
    const [state, setState] = useState(initState)
    const store = useConstant(() => new FelixObservableStore(KEY, initState))
    const $input = new BehaviorSubject<T>(initState)
    useEffect(() => {
        let customSub: Subscription
        if (additional) {
            customSub = additional($input).subscribe(state => {
                state && store.dispatch(KEY, state)
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

    return [state, (state) => store.dispatch(KEY, state), KEY]
}

export const FelixObsInstance = FelixObservableStore.getInstance()
export default FelixObservableStore