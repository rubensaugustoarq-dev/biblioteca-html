/** One request at a time; queued pointer movements keep only the latest position.
 * Invalidated results must never reappear after a click, parameter change or leave.
 */
export class HoverPreview<Input,Output>{
 private version=0;private queued:{value:Input;version:number}|null=null;
 private timer:ReturnType<typeof setTimeout>|null=null;private running=false;private disposed=false;
 constructor(private load:(value:Input)=>Promise<Output>,private result:(value:Output|null,error:string)=>void,private delay=16){}
 move(value:Input){if(this.disposed)return;this.queued={value,version:++this.version};this.schedule();}
 clear(){this.version++;this.queued=null;if(this.timer!==null)clearTimeout(this.timer);this.timer=null;}
 dispose(){this.clear();this.disposed=true;}
 private schedule(){if(!this.running&&this.timer===null&&this.queued)this.timer=setTimeout(()=>{this.timer=null;void this.flush();},this.delay);}
 private async flush(){
  const next=this.queued;if(!next||this.disposed)return;this.queued=null;this.running=true;
  try{const value=await this.load(next.value);if(!this.disposed&&next.version===this.version)this.result(value,'');}
  catch(error){if(!this.disposed&&next.version===this.version)this.result(null,error instanceof Error?error.message:'Não foi possível conferir o encaixe.');}
  finally{this.running=false;this.schedule();}
 }
}
