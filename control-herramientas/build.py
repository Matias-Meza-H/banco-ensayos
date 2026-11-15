import sys
d=sys.argv[1]
t=open(d+'/app.html').read()
t=t.replace('__LOGO__',open(d+'/logo.txt').read().strip()).replace('__DATA__',open(d+'/data.json').read().replace('</','<\\/'))
open(d+'/control-herramientas.html','w').write(t)
print(len(t))
