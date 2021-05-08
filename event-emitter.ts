import { Subject } from 'rxjs';

interface mapSubType<T>{
    [key:string]: Subject<T>
}
type handlerType<T> =  (value: T) => void
//事件处理
export class Emitter{

    private _subjects:mapSubType<any>  = {}

    createName (key:string) {
        return '$' + key;
    }
    emit<TData>(key:string,data:TData) {
        const fnKey = this.createName(key);
        this._subjects[fnKey] || (this._subjects[fnKey] = new Subject());
	    this._subjects[fnKey].next(data);
    }
    listen<TData>(key:string,handler:handlerType<TData>){
        const fnKey = this.createName(key);
        this._subjects[fnKey] || (this._subjects[fnKey] = new Subject());
        return this._subjects[fnKey].subscribe(handler);
    }
    removeListen(key:string){
        const fnKey = this.createName(key);
        if(this._subjects[fnKey]){
            this._subjects[key].unsubscribe()
        }
        delete this._subjects[key]
    }
    dispose(){
        for (const key in this._subjects) {
            if (Object.prototype.hasOwnProperty.call(this._subjects, key)) {
                this._subjects[key].unsubscribe()
            }
        }
        this._subjects = {}
    }

}

export default new Emitter()