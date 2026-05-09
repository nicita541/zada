# Задачник Desktop

Это отдельное ПК-приложение. Backend запускается отдельно через Docker, приложение устанавливается отдельно и подключается к `http://localhost:3000/api`.

## Разработка

```powershell
cd E:\Задачник\desktop
npm install
npm start
```

## Сборка установщика Windows

```powershell
cd E:\Задачник\desktop
npm install
npm run dist
```

Готовые файлы появятся в `desktop\release`.

## Переменные подключения

По умолчанию:

```text
TASKBOOK_API_BASE=http://localhost:3000/api
TASKBOOK_USER_ID=local-user
```

Можно запускать с другим сервером:

```powershell
$env:TASKBOOK_API_BASE="https://tasks.example.com/api"
npm start
```

## Как это работает

- UI хранится внутри установленного приложения, не открывается как сайт.
- Backend и Postgres запускаются отдельно в Docker.
- Desktop app проверяет backend, синхронизирует данные через API и показывает нативные уведомления Windows.
- Если сервер временно недоступен, UI продолжает работать с локальной IndexedDB и синхронизируется позже.
