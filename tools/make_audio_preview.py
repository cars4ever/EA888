from pathlib import Path
import wave
import numpy as np
from scipy.io import wavfile
from scipy.signal import fftconvolve
ROOT=Path(__file__).resolve().parents[1]
A=ROOT/'src/assets/audio'
OUT=Path('/mnt/data/EA888-Lab-v1.0.0-audio-preview.wav')
SR=32000

def read(name):
    sr,x=wavfile.read(A/name)
    assert sr==SR
    return x.astype(np.float32)/32768.0

def segment(name, dur, gain=1.0, rate=1.0):
    x=read(name)
    n=int(dur*SR)
    # loop and resample by linear interpolation to requested playback rate
    pos=(np.arange(n)*rate)%len(x)
    i=np.floor(pos).astype(int); f=pos-i
    y=x[i]*(1-f)+x[(i+1)%len(x)]*f
    return y*gain

def xfade(a,b,t=.18):
    n=min(int(t*SR),len(a),len(b))
    if n<=0:return np.concatenate([a,b])
    w=np.linspace(0,1,n)
    return np.concatenate([a[:-n],a[-n:]*(1-w)+b[:n]*w,b[n:]])

seq=segment('engine_900.wav',1.2,.40)
for name,dur,gain,rate in [
    ('engine_2400.wav',1.15,.55,1.0),('engine_4200.wav',1.15,.72,1.0),('engine_6000.wav',1.15,.80,1.0),
    ('engine_7800.wav',.85,.86,1.0),('engine_4200.wav',.72,.72,1.0),('engine_6000.wav',.95,.82,1.0),
    ('engine_8400.wav',.75,.88,1.0),('engine_4200.wav',.65,.72,1.0),('engine_7800.wav',1.2,.86,1.0)]:
    seq=xfade(seq,segment(name,dur,gain,rate),.12)
# Add launch and shift events at approximate moments.
for t,name,gain in [(.95,'launch.wav',.38),(3.95,'shift_manual.wav',.58),(5.85,'shift_dsg.wav',.55),(7.10,'blowoff.wav',.25),(8.05,'limiter.wav',.20)]:
    fx=read(name)*gain; i=min(len(seq)-1,int(t*SR)); end=min(len(seq),i+len(fx)); seq[i:end]+=fx[:max(0,end-i)]
# Add turbo sample during high-rpm part.
turbo=segment('turbo.wav',len(seq)/SR,.13,1.0)
env=np.clip((np.arange(len(seq))/SR-1.7)/2.2,0,1)*np.clip((len(seq)/SR-np.arange(len(seq))/SR)/1.1,0,1)
seq+=turbo*env
# Small stereo room/exhaust reflection.
ir=np.zeros(int(.28*SR),np.float32); ir[0]=1; ir[int(.034*SR)]=.18; ir[int(.071*SR)]=.12; ir[int(.137*SR)]=.07
left=fftconvolve(seq,ir,mode='full')[:len(seq)]
ir2=np.zeros_like(ir); ir2[0]=1; ir2[int(.042*SR)]=.17; ir2[int(.089*SR)]=.10; ir2[int(.151*SR)]=.06
right=fftconvolve(seq,ir2,mode='full')[:len(seq)]
st=np.stack([left,right],axis=1)
st=np.tanh(st*1.35)
st/=max(np.max(np.abs(st)),1e-6)
st*=.92
wavfile.write(OUT,SR,(st*32767).astype('<i2'))
print(OUT,len(st)/SR)
