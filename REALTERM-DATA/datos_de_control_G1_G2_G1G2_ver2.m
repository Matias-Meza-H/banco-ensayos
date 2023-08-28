clc
clear all
%% IMPORTAR DATOS
data01 = readtable('G1-emp-estab-01.xlsx'); %[1,3,6,9]- {tiempo,emp,emp_ref,ang_entrada]
data02 = readtable('G1-emp-estab-02.xlsx'); 
data03 = readtable('G2-rps-estab-01.xlsx'); %[1,2,6,9]- {t,rps,rps_ref,pot_entrada}
data04 = readtable('G2-rps-estab-02.xlsx');
data05 = readtable('G2-rps-estab-03.xlsx');
data06 = readtable('G1G2-estab-01.xlsx'); %[1,2,3,6,7,12,13]
%% selecciona datos
dt01 = data01{186:743,[1,3,6,9]};
dt02 = data01{746:1247,[1,3,6,9]};
dt03 = data02{100:439,[1,3,6,9]};
dt04 = data02{442:733,[1,3,6,9]};
dt05 = data02{736:937,[1,3,6,9]};
dt06 = data02{940:1444,[1,3,6,9]};
dt07 = data02{1447:1758,[1,3,6,9]};

dt08 = data03{105:628,[1,2,6,9]};
dt09 = data03{631:1013,[1,2,6,9]};
dt10 = data03{1016:1443,[1,2,6,9]};
dt11 = data03{1446:2211,[1,2,6,9]};
dt12 = data04{103:547,[1,2,6,9]};
dt13 = data04{550:1131,[1,2,6,9]};
dt14 = data04{1134:2169,[1,2,6,9]};
dt15 = data04{2172:2760,[1,2,6,9]};
dt16 = data04{2763:3525,[1,2,6,9]};
dt17 = data05{178:567,[1,2,6,9]};
dt18 = data05{570:658,[1,2,6,9]};  % colapso de la ESC
dt19 = data05{873:1673,[1,2,6,9]};
dt20 = data05{2150:2367,[1,2,6,9]};

dt21 = data06{277:788,[1,2,3,6,7,12,13]};
dt22 = data06{791:1194,[1,2,3,6,7,12,13]};
dt23 = data06{1197:1628,[1,2,3,6,7,12,13]};
dt24 = data06{1631:1970,[1,2,3,6,7,12,13]};
dt25 = data06{1973:2324,[1,2,3,6,7,12,13]};

%% Tiempos
t01 = (dt01(:,1)-dt01(1,1))/1000;
t02 = (dt02(:,1)-dt02(1,1))/1000;
t03 = (dt03(:,1)-dt03(1,1))/1000;
t04 = (dt04(:,1)-dt04(1,1))/1000;
t05 = (dt05(:,1)-dt05(1,1))/1000;
t06 = (dt06(:,1)-dt06(1,1))/1000;
t07 = (dt07(:,1)-dt07(1,1))/1000;
t08 = (dt08(:,1)-dt08(1,1))/1000;
t09 = (dt09(:,1)-dt09(1,1))/1000;
t10 = (dt10(:,1)-dt10(1,1))/1000;
t11 = (dt11(:,1)-dt11(1,1))/1000;
t12 = (dt12(:,1)-dt12(1,1))/1000;
t13 = (dt13(:,1)-dt13(1,1))/1000;
t14 = (dt14(:,1)-dt14(1,1))/1000;
t15 = (dt15(:,1)-dt15(1,1))/1000;
t16 = (dt16(:,1)-dt16(1,1))/1000;
t17 = (dt17(:,1)-dt17(1,1))/1000;
t18 = (dt18(:,1)-dt18(1,1))/1000;
t19 = (dt19(:,1)-dt19(1,1))/1000;
t20 = (dt20(:,1)-dt20(1,1))/1000;
t21 = (dt21(:,1)-dt21(1,1))/1000;
t22 = (dt22(:,1)-dt22(1,1))/1000;
t23 = (dt23(:,1)-dt23(1,1))/1000;
t24 = (dt24(:,1)-dt24(1,1))/1000;
t25 = (dt25(:,1)-dt25(1,1))/1000;

%% Graficas

tiledlayout(2,2)
nexttile
hold on
plot(t01,dt01(:,2),'b',t01,dt01(:,3),'b')
plot(t02,dt02(:,2),'r',t02,dt02(:,3),'r')
hold off

nexttile
hold on
plot(t03,dt03(:,2),'b',t03,dt03(:,3),'b')
plot(t05,dt05(:,2),'r',t05,dt05(:,3),'r')
hold off

nexttile
hold on
plot(t06,dt06(:,2),'b',t06,dt06(:,3),'b')
plot(t07,dt07(:,2),'r',t07,dt07(:,3),'r')
hold off
%%
plot(t04,dt04(:,2),'r',t04,dt04(:,3),'r')  % caso especial: nunca logra estabilidad por temas mecanicos
title('Grafico Estabilizacion de Empuje [gf] (PID 1)')
xlabel('Tiempo [s]')
ylabel('Empuje [gf]')
grid on
%% No convergencia
tiledlayout(2,2)
nexttile
hold on
plot(t08,dt08(:,2),'g',t08,dt08(:,3),'g')
plot(t09,dt09(:,2),'r',t09,dt09(:,3),'r')
plot(t10,dt10(:,2),'b',t10,dt10(:,3),'b')
hold off

nexttile
hold on
plot(t12,dt12(:,2),'g',t12,dt12(:,3),'g')
plot(t13,dt13(:,2),'r',t13,dt13(:,3),'r')
plot(t14,dt14(:,2),'b',t14,dt14(:,3),'b')  %inicia estable, inestable
hold off

nexttile
hold on
plot(t16,dt16(:,2),'b',t16,dt16(:,3),'b')
plot(t17,dt17(:,2),'r',t17,dt17(:,3),'r')
hold off

t.TileSpacing = 'compact';

%% CASO DE INESTABILIDAD EXTREMA
hold on
plot(t18,dt18(:,2),'b',t18,dt18(:,3),'b')  % revento
plot(t20,dt20(:,2),'r',t20,dt20(:,3),'r')
hold off

title('Grafico Estabilizacion de RPS (PID 2)')
xlabel('tiempo [s]')
ylabel('RPS')

grid on
%% CASOS DE ESTABILIDAD
hold on
plot(t19,dt19(:,2),'b',t19,dt19(:,3),'b')  % estable
plot(t15,dt15(:,2),'r',t15,dt15(:,3),'r')  % estable
plot(t11,dt11(:,2),'g',t11,dt11(:,3),'g')  % media estabilidad
title('Grafico Estabilizacion de RPS (PID 2)')
xlabel('tiempo [s]')
ylabel('RPS')
hold off
grid on
%% PID Conjunto [1 tiempo - 2,5,7 RPS - 3,4,6 EMP]

hold on
yyaxis left
plot(t21,dt21(:,3),t21,dt21(:,4),':')  % empuje
mycolors1 = [0 0.4470 0.7410];
ax = gca; 
ax.ColorOrder = mycolors1;
ylabel('Empuje [gf]')
yyaxis right
plot(t21,dt21(:,2),t21,dt21(:,5),':')  % rps
mycolors2 = [0.8500 0.3250 0.0980];
ax = gca; 
ax.ColorOrder = mycolors2;
ylabel('RPS')
hold off

title('Grafico Estabilizacion (PID 1+2)')
xlabel('tiempo [s]')

grid on
%%
hold on
yyaxis left
plot(t22,dt22(:,3),t22,dt22(:,4),':')  % empuje
mycolors1 = [0 0.4470 0.7410];
ax = gca; 
ax.ColorOrder = mycolors1;
ylabel('Empuje [gf]')
yyaxis right
plot(t22,dt22(:,2),t22,dt22(:,5),':')  % rps
mycolors2 = [0.8500 0.3250 0.0980];
ax = gca; 
ax.ColorOrder = mycolors2;
ylabel('RPS')
hold off

title('Grafico Estabilizacion (PID 1+2)')
xlabel('tiempo [s]')

grid on
%%
hold on
yyaxis left
plot(t23,dt23(:,3),t23,dt23(:,4),':')  % empuje
mycolors1 = [0 0.4470 0.7410];
ax = gca; 
ax.ColorOrder = mycolors1;
ylabel('Empuje [gf]')
yyaxis right
plot(t23,dt23(:,2),t23,dt23(:,5),':')  % rps
mycolors2 = [0.8500 0.3250 0.0980];
ax = gca; 
ax.ColorOrder = mycolors2;
ylabel('RPS')
hold off

title('Grafico Estabilizacion (PID 1+2)')
xlabel('tiempo [s]')

grid on
%%
hold on
yyaxis left
plot(t24,dt24(:,3),t24,dt24(:,4),':')  % empuje
mycolors1 = [0 0.4470 0.7410];
ax = gca; 
ax.ColorOrder = mycolors1;
ylabel('Empuje [gf]')
yyaxis right
plot(t24,dt24(:,2),t24,dt24(:,5),':')  % rps
mycolors2 = [0.8500 0.3250 0.0980];
ax = gca; 
ax.ColorOrder = mycolors2;
ylabel('RPS')
hold off

title('Grafico Estabilizacion (PID 1+2)')
xlabel('tiempo [s]')

grid on

%%
hold on
yyaxis left
plot(t25,dt25(:,3),t25,dt25(:,4),':')  % empuje
mycolors1 = [0 0.4470 0.7410];
ax = gca; 
ax.ColorOrder = mycolors1;
ylabel('Empuje [gf]')
yyaxis right
plot(t25,dt25(:,2),t25,dt25(:,5),':')  % rps
mycolors2 = [0.8500 0.3250 0.0980];
ax = gca; 
ax.ColorOrder = mycolors2;
ylabel('RPS')
hold off

title('Grafico Estabilizacion (PID 1+2)')
xlabel('tiempo [s]')

grid on