clc
clear all
%% Lectura de datos
datos1 = readtable('rango-operacion-1.xlsx');
datos2 = readtable('rango-operacion-2.xlsx');
datos3 = readtable('rango-operacion-3.xlsx');
% Filtro [tiempo - RPS - empuje - ang - potencia]
dt1 = datos1(:,[2,3]);
dt2 = datos2(:,[2,3]);
dt3 = datos3(:,[2,3]);
%% Proceso
emp1 = dt1{:,2}+36;
emp2 = dt2{:,2}+67;
emp3 = dt3{:,2}+67;

rps1 = dt1{:,1};
rps2 = dt2{:,1};
rps3 = dt3{:,1};
%% GRAFICA
hold on
plot(emp1,rps1,'.-')
plot(emp2,rps2,'.-')
plot(emp3,rps3,'.-')
hold off
grid on

%% datos para graficar funcionamiento del BdE para medir un CL (ang fijo, rps variable)
% DATO1 - (485,1143):30.5°(error)
% DATO2 - (2134,3400):17°(+error)

test1 = datos2{485:1143,[1,2,3]};
test2 = datos2{2134:3400,[1,2,3]};
% [tiempo,rps,empuje]

t1 = (test1(:,1)-test1(1:1))/1000;
t2 = (test2(:,1)-test2(1:1))/1000;
rps01 = test1(35:659,2);
rps02 = test2(300:1267,2);
empuje1 = test1(35:659,3);
empuje2 = test2(300:1267,3);

p1 = polyfit(empuje1,rps01,2);
rps1_fix = polyval(p1,empuje1);
p2 = polyfit(empuje2,rps02,2);
rps2_fix = polyval(p2,empuje2);
%% C_thrust
ct1 = (empuje1*9.81/1000)./(1.29*rps1_fix.^2*0.2032^4);
rpm1 = rps1_fix*60;
ct2 = (empuje2*9.81/1000)./(1.29*rps2_fix.^2*0.2032^4);
rpm2 = rps2_fix*60;
%% grafica de empuje
cla reset
hold on
plot(rps01,empuje1,'r.')
plot(rps1_fix,empuje1,'r')
plot(rps02,empuje2,'g.')
plot(rps2_fix,empuje2,'g')
hold off
grid on
%% grafica C_t
cla reset
hold on
plot(rpm1,ct1,'r')
plot(rpm2,ct2,'g')
hold off
grid on